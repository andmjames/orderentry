const { zohoGet, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    let page = 1, allContacts = [], hasMore = true;
    while (hasMore && page <= 50) {
      const data = await zohoGet(`/contacts?contact_type=customer&per_page=200&page=${page}`);
      const contacts = data.contacts || [];
      allContacts = allContacts.concat(contacts);
      hasMore = data.page_context?.has_more_page === true;
      page++;
    }
    // Exclude inactive contacts so they can't be picked or auto-matched.
    // (Zoho returns status "active"/"inactive" per contact; treat missing as active.)
    const customers = allContacts
      .filter(c => String(c.status || 'active').toLowerCase() !== 'inactive')
      .map(c => ({
        id:    c.contact_id,
        name:  c.contact_name,
        email: c.email || '',
        phone: c.phone || '',
      }));
    return { statusCode: 200, headers, body: JSON.stringify(customers) };
  } catch (err) {
    console.error('zoho-customers error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
