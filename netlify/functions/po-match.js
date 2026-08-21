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

// Repair JSON whose string values contain unescaped double quotes — most often inch
// marks in product descriptions (e.g. "2" White Tape"), which otherwise terminate the
// string early and break JSON.parse. Walks the text tracking string state; a quote
// inside a string is treated as a real closing quote only when the next meaningful
// character is a structural delimiter, otherwise it gets escaped.
function repairInnerQuotes(src) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }
    if (ch === '\\') { out += ch + (src[i + 1] || ''); i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      const next = src[j];
      if (next === undefined || next === ',' || next === ':' || next === '}' || next === ']') {
        out += ch; inStr = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function parseJson(text) {
  if (!text) throw new Error('Empty response from Claude');
  let t = String(text).trim();
  // Remove markdown code fences anywhere in the output (```json ... ``` or stray ```),
  // not just at the very start/end — models sometimes wrap or annotate the JSON.
  t = t.replace(/```+(?:json)?/gi, '');
  const start = t.indexOf('{');
  const end   = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (e) {
    // Unescaped inner quotes (inch marks) are the common culprit — repair and retry.
    try { return JSON.parse(repairInnerQuotes(t)); } catch { /* fall through */ }
    // Last resort: drop any stray backticks (never valid in this JSON) and retry once.
    try { return JSON.parse(repairInnerQuotes(t.replace(/`/g, ''))); }
    catch { throw e; }
  }
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

Match each PO line to AT MOST ONE catalog item_number. A PO line's 'identifier' is normally OUR item number, and 'customer_identifier' (when present) is the customer's own code. Match using ANY of: PO 'identifier' to catalog item_number, PO 'customer_identifier' to catalog alias, or a clear description match. If a PO line does not clearly correspond to a catalog item, leave it unmatched (do NOT guess).

BRAND / PRIVATE-LABEL EQUIVALENCE (important): PMI Tape is the manufacturer, and customers routinely stock PMI's products under their OWN private-label brand. So the SAME physical product often appears on the PO under the "PMI" brand while the customer's catalog lists it under the customer's own brand (e.g. "River City", with item numbers like "RIV..."). Do NOT treat the brand name as a distinguishing attribute, and do NOT exclude a line just because the PO says "PMI" while the only matching catalog entry uses a different brand. Match on the PRODUCT SPEC instead: the family / model number (e.g. 451, 560), the width (2" / 3" / 4"), the length (e.g. 60YD), and the product type (e.g. Split Tape, RED Tape). If those align, it is the same product — match it.
Example: a PO line "PMI #451-3" Split Tape / 3"X60YD PMI #451 Split Tape" MUST match a catalog item like "RIV3451 — River City #451 Split Tape, 3"x60YD", because both are the 451 Split Tape in 3" x 60YD; only the brand differs (PMI vs River City), which does not matter.
Still require the spec to genuinely align: never match across a different family number (451 vs 560), a different width (3" vs 2"), or a different product type. Leave a line unmatched only when NO catalog item shares the same product family, width, and type — not merely because the brand label differs.

For every matched line, return ordered_quantity = the number of individual selling units (each / rolls / sheets) ordered for that catalog item. NEVER round to a whole case.
- If the PO quantity is already stated in individual units, ordered_quantity = that quantity exactly (e.g., 96 rolls stays 96).
- If the PO quantity is stated in CASES (or cartons), ordered_quantity = cases × units_per_case for that catalog item.

Return ONLY JSON with this shape (no markdown fences, no prose). IMPORTANT: inside JSON string values, any double-quote character must be escaped as \\" — product descriptions often contain inch marks (e.g. 3\\" x 60YD). An unescaped inch mark makes the response invalid JSON.
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
      // Structured output via tool use: the API returns an already-parsed, schema-checked
      // JSON object, so malformed text (unescaped inch marks, code fences) can't break us.
      tools: [{
        name: 'submit_matches',
        description: 'Return the PO-line-to-catalog matching result.',
        input_schema: {
          type: 'object',
          properties: {
            matches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  po_index: { type: 'integer' },
                  item_number: { type: 'string' },
                  ordered_quantity: { type: 'number' },
                  basis: { type: 'string' },
                },
                required: ['po_index', 'item_number', 'ordered_quantity'],
              },
            },
            unmatched: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  po_index: { type: 'integer' },
                  identifier: { type: 'string' },
                  description: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['po_index'],
              },
            },
          },
          required: ['matches', 'unmatched'],
        },
      }],
      tool_choice: { type: 'tool', name: 'submit_matches' },
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

    // Preferred path: the tool_use block's `input` is already a parsed JSON object.
    const toolBlock = (data.content || []).find(b => b.type === 'tool_use' && b.input);
    if (toolBlock) {
      return { statusCode: 200, headers, body: JSON.stringify(toolBlock.input) };
    }

    // Fallback: parse text output (older behaviour), with repair for malformed JSON.
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    let result;
    try {
      result = parseJson(text);
    } catch (e) {
      // Surface what the model actually returned so the failure is diagnosable.
      const snippet = String(text || '').slice(0, 400).replace(/\s+/g, ' ');
      throw new Error(`Could not parse match response (${e.message}). Model output started: ${snippet}`);
    }
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('po-match error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
