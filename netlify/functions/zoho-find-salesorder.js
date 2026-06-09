// Finds a Zoho Inventory sales order by its salesorder_number and returns its id.
// GET /salesorders?salesorder_number=NNN
const { zohoGet, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    const { number } = event.queryStringParameters || {};
    if (!number) return { statusCode: 400, headers, body: JSON.stringify({ error: 'number required' }) };

    const data = await zohoGet(`/salesorders?salesorder_number=${encodeURIComponent(number)}`);
    const list = Array.isArray(data.salesorders) ? data.salesorders : [];
    // Prefer an exact number match; fall back to the first result.
    const so = list.find(s => String(s.salesorder_number) === String(number)) || list[0] || null;

    if (!so) return { statusCode: 200, headers, body: JSON.stringify({ salesorder_id: null, salesorder_number: number }) };
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ salesorder_id: so.salesorder_id, salesorder_number: so.salesorder_number }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
