// Check whether a sales order with the same reference number (customer PO #)
// already exists in Zoho Inventory for the same customer.
const { zohoGet, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    checkEnv();
    const customerId = event.queryStringParameters?.customer_id;
    const poNumber   = (event.queryStringParameters?.po_number || '').trim();

    if (!customerId || !poNumber) {
      return { statusCode: 200, headers, body: JSON.stringify({ duplicate: false, matches: [] }) };
    }

    const norm = s => String(s || '').trim().toLowerCase();
    const target = norm(poNumber);

    // Filter by customer + reference number. Zoho's reference_number filter can be
    // loose, so we re-check for an exact (case-insensitive) match in code.
    const path = `/salesorders?customer_id=${encodeURIComponent(customerId)}&reference_number=${encodeURIComponent(poNumber)}`;
    const data = await zohoGet(path);

    const matches = (data.salesorders || [])
      .filter(so => norm(so.reference_number) === target)
      .map(so => ({
        salesorder_number: so.salesorder_number,
        reference_number:  so.reference_number,
        date:              so.date,
        status:            so.status,
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ duplicate: matches.length > 0, matches }),
    };
  } catch (err) {
    console.error('zoho-check-po error:', err);
    // Don't block order entry on a check failure — just report no duplicate.
    return { statusCode: 200, headers, body: JSON.stringify({ duplicate: false, matches: [], error: err.message }) };
  }
};
