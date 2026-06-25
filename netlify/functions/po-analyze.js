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

    // Build the content block based on the file type.
    //  - PDF                          → document block
    //  - jpeg/png/gif/webp            → image block
    //  - anything else (email body,   → text block (decode the base64 to text)
    //    .txt, .eml, .html, unknown)
    let mt = (mediaType || '').toLowerCase();
    if (mt === 'image/jpg') mt = 'image/jpeg';
    const validImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    let fileBlock;
    if (mt === 'application/pdf') {
      fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } };
    } else if (validImage.includes(mt)) {
      fileBlock = { type: 'image', source: { type: 'base64', media_type: mt, data: fileBase64 } };
    } else {
      let text = '';
      try { text = Buffer.from(fileBase64, 'base64').toString('utf-8'); } catch (e) { text = ''; }
      fileBlock = {
        type: 'text',
        text: `The purchase order below arrived as text (for example, an email body). Treat the following as the PO document:\n\n${text}`,
      };
    }

    const prompt = `You are an order-entry assistant for a manufacturer (PMI Tape / Packaging Materials, Inc.). You are reading an uploaded document that is EITHER a customer's Purchase Order (PO) OR one of our own PMI Tape Sales Orders (a document titled "SALES ORDER" with a "Sales Order #", issued BY us). Detect which it is.

Tasks:

0) DETECT DOCUMENT TYPE. If the document is our own PMI Tape "Sales Order" (titled "SALES ORDER", shows "Sales Order #", and PMI Tape / Packaging Materials, Inc. is the issuer/seller), set document_type to "sales_order" and put the Sales Order number in sales_order_number. Otherwise it is a customer purchase order: set document_type to "purchase_order" and sales_order_number to null. On a Sales Order, the "Bill To" name is the customer, the "Ship To" is the destination, the "PO #" is the customer's PO number, and the line items already use OUR exact item numbers.

1) IDENTIFY THE CUSTOMER. Choose the single best match from this exact list of our known customers. You MUST copy the chosen name verbatim from the list (or use null if none is a reasonable match):
${JSON.stringify(customerNames, null, 2)}

2) EXTRACT EVERY LINE ITEM exactly as printed. Do not invent items.

Return ONLY a JSON object, no prose, with this shape:
{
  "document_type": "<'sales_order' or 'purchase_order'>",
  "sales_order_number": "<our Sales Order # if document_type is sales_order, else null>",
  "customer_name": "<exact name from the list, or null>",
  "confidence": <number 0-1>,
  "po_number": "<the purchase order number exactly as printed, INCLUDING any hyphenated segment or suffix (e.g. '108746-00'). Look for a labeled field such as 'PO #', 'P/O NUMBER', 'Purchase Order', or 'Order Number', often in a boxed header. Use null only if there is genuinely no PO number anywhere>",
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
      "identifier": "<OUR (the supplier's) item/part number for this line — the one to match against our catalog. Many POs print TWO numbers per line: the customer's own internal part number AND our/vendor number (often under a 'YOUR ITEM NUMBER', 'Vendor Item', 'Supplier Part', or 'Mfr #' column, and frequently starting with 'PMI'). Choose OUR/vendor number (usually the one starting with 'PMI'). If only one number is present, use it>",
      "customer_identifier": "<the customer's own internal part number for this line if a different second number is also printed (e.g. a code like '355-278-1-RL'), else null>",
      "description": "<the full item description as printed (may wrap across several printed lines — include all of it), or null>",
      "quantity": <number as printed>,
      "unit_of_measure": "<e.g. Each, Roll, Case, Sheet, Carton, as printed, or null>",
      "unit_price": <number as printed, or null>
    }
  ]
}

Notes:
- If the PO shows quantities only in cases, set unit_of_measure to "Case".
- Keep numbers numeric (no currency symbols or commas).
- Be thorough: capture EVERY numbered line in the items table (e.g. the 'LINE NO.' column), even when descriptions wrap across multiple printed rows and even across multiple pages. Do not skip lines.
- DUAL ITEM NUMBERS (important for matching): some POs print both the customer's own part number and our/vendor part number on each line (commonly in columns like 'OUR ITEM NUMBER' = the customer's code, and 'YOUR ITEM NUMBER' = ours, since the PO is written from the customer's perspective). Put OUR/vendor number — typically the one beginning with 'PMI' — in 'identifier', and the customer's own code in 'customer_identifier'. Matching is done on 'identifier', so choosing our number is critical.
- Shipping account: if the PO lists a shipping/collect account number, classify it by the shipping method — small-parcel carriers (UPS, FedEx, USPS, anything labeled "Ground" or "Parcel") go in parcel_account_number; freight/LTL/truck carriers go in freight_account_number. If you can't tell which, put it in the one matching the stated method; if there's no method, leave both null.
- IMPORTANT: We are the manufacturer/supplier "PMI Tape" / "Packaging Materials, Inc" at 525 Herriman Ct, Noblesville, IN 46060. That is OUR address and often appears on the PO as the supplier, bill-to, or vendor. NEVER use it as ship_to. The ship_to is the customer's destination; if the only address you can find is ours, leave ship_to fields null.`;

    const payload = {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0,
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
