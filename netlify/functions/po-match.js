// Step 2 of 2: match the raw PO line items to the SELECTED customer's own catalog
// (the items that customer has pricing for). Lines that don't match a catalog item
// are returned as "unmatched" and will be excluded from the order.

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const headers = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

function parseJson(text) {
  if (!text) throw new Error('Empty response from Claude');
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end   = t.lastIndexOf('}');
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing environment variable: ANTHROPIC_API_KEY');
    }

    const { lineItems, catalog } = JSON.parse(event.body || '{}');
    if (!Array.isArray(lineItems) || !Array.isArray(catalog)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'lineItems and catalog required' }) };
    }
    if (lineItems.length === 0 || catalog.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ matches: [], unmatched: lineItems }) };
    }

    const prompt = `You match Purchase Order line items to a specific customer's product catalog.

CUSTOMER CATALOG (the only products this customer may order). Each entry has our item_number, the customer's own alias/part number (if any), a description, units_per_case, and unit of measure:
${JSON.stringify(catalog, null, 2)}

PO LINE ITEMS extracted from the customer's purchase order (with their original array index):
${JSON.stringify(lineItems.map((li, i) => ({ po_index: i, ...li })), null, 2)}

Match each PO line to AT MOST ONE catalog item_number. Match on our item_number, the customer's alias, OR a clear description match. If a PO line does not clearly correspond to a catalog item, leave it unmatched (do NOT guess).

For every matched line, return ordered_quantity = the number of individual selling units (each / rolls / sheets) ordered for that catalog item. NEVER round to a whole case.
- If the PO quantity is already stated in individual units, ordered_quantity = that quantity exactly (e.g., 96 rolls stays 96).
- If the PO quantity is stated in CASES (or cartons), ordered_quantity = cases × units_per_case for that catalog item.

Return ONLY JSON with this shape:
{
  "matches": [
    {
      "po_index": <int>,
      "item_number": "<catalog item_number>",
      "ordered_quantity": <number of units, exact — not rounded to a case>,
      "basis": "<short note, e.g. 'matched alias; PO says 96 rolls'>"
    }
  ],
  "unmatched": [
    { "po_index": <int>, "identifier": "<as printed>", "description": "<as printed>", "reason": "<why not matched>" }
  ]
}

Every PO line must appear in exactly one of the two arrays. ordered_quantity must be a positive number; keep the customer's exact quantity even when it isn't a whole number of cases.`;

    const payload = {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0,
      messages: [ { role: 'user', content: prompt } ],
    };

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(data)}`);

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const result = parseJson(text);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('po-match error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
