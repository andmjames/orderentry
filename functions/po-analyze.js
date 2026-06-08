// Analyze an uploaded customer Purchase Order with Claude (Sonnet).
// Step 1 of 2: identify which customer the PO is from and extract the raw line items.
// Pricing/matching is handled later (po-match) using the customer's own catalog.

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const headers = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

// Pull the first JSON object out of a model response, tolerating code fences / prose.
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

    const { fileBase64, mediaType, customers } = JSON.parse(event.body || '{}');
    if (!fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileBase64 required' }) };
    }

    const customerNames = (customers || []).map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean);

    // Build the document/image content block
    let fileBlock;
    if ((mediaType || '').toLowerCase() === 'application/pdf') {
      fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } };
    } else {
      fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: fileBase64 } };
    }

    const prompt = `You are an order-entry assistant for a manufacturer. You are reading a customer's Purchase Order (PO) document.

Two tasks:

1) IDENTIFY THE CUSTOMER. Choose the single best match from this exact list of our known customers. You MUST copy the chosen name verbatim from the list (or use null if none is a reasonable match):
${JSON.stringify(customerNames, null, 2)}

2) EXTRACT EVERY LINE ITEM exactly as printed on the PO. Do not invent items.

Return ONLY a JSON object, no prose, with this shape:
{
  "customer_name": "<exact name from the list, or null>",
  "confidence": <number 0-1>,
  "po_number": "<the PO / order number, or null>",
  "po_date": "<date on the PO as written, or null>",
  "ship_to": {
    "attention": "<company / contact the order ships to, or null>",
    "address": "<street line 1, or null>",
    "street2": "<street line 2 / suite, or null>",
    "city": "<city, or null>",
    "state": "<state/province, or null>",
    "zip": "<postal code, or null>",
    "country": "<country, or null>",
    "text": "<the full ship-to block exactly as printed>"
  },
  "shipping_method": "<carrier / method as printed on the PO, e.g. 'UPS Ground', 'FedEx', 'LTL', 'Freight', 'Parcel', or null>",
  "parcel_account_number": "<account number for a small-parcel carrier (UPS / FedEx / USPS / Ground) if the PO lists one, else null>",
  "freight_account_number": "<account number for freight / LTL / truck carriers if the PO lists one, else null>",
  "line_items": [
    {
      "identifier": "<the item number / SKU / part code as printed>",
      "description": "<item description as printed, or null>",
      "quantity": <number as printed>,
      "unit_of_measure": "<e.g. Each, Roll, Case, Sheet, Carton, as printed, or null>",
      "unit_price": <number as printed, or null>
    }
  ]
}

Notes:
- If the PO shows quantities only in cases, set unit_of_measure to "Case".
- Keep numbers numeric (no currency symbols or commas).
- Be thorough: capture all line items even across multiple pages.
- Shipping account: if the PO lists a shipping/collect account number, classify it by the shipping method — small-parcel carriers (UPS, FedEx, USPS, anything labeled "Ground" or "Parcel") go in parcel_account_number; freight/LTL/truck carriers go in freight_account_number. If you can't tell which, put it in the one matching the stated method; if there's no method, leave both null.`;

    const payload = {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: [ fileBlock, { type: 'text', text: prompt } ] },
      ],
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
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(data)}`);
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const result = parseJson(text);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('po-analyze error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
