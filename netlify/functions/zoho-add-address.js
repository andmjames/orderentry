// Adds an additional (shipping) address to a Zoho Inventory contact.
// POST body: { customer_id, address: { attention, address, street2, city, state, zip, country, phone } }
const { zohoPost, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    checkEnv();
    const { customer_id, address } = JSON.parse(event.body || '{}');
    if (!customer_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'customer_id is required' }) };
    }
    const a = address || {};
    const body = {
      attention: a.attention || '',
      address:   a.address || a.street || '',
      street2:   a.street2 || '',
      city:      a.city || '',
      state:     a.state || '',
      zip:       a.zip || '',
      country:   a.country || 'USA',
      phone:     a.phone || '',
    };

    const res = await zohoPost(`/contacts/${encodeURIComponent(customer_id)}/address`, body);
    // Zoho returns the new address in address_info (with address_id); be tolerant of shape.
    const info = res.address_info || res.address || {};
    const address_id = info.address_id || res.address_id || null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ address_id, address: { ...body, address_id } }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
