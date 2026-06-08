const { zohoGet, headers, checkEnv } = require('./zoho-utils');

function cf(contact, label) {
  return contact.custom_fields?.find(f => f.label === label)?.value || '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    const { id } = event.queryStringParameters || {};
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

    const data    = await zohoGet(`/contacts/${id}`);
    const contact = data.contact;

    const customer = {
      id:                 contact.contact_id,
      name:               contact.contact_name,
      paymentTerms:       contact.payment_terms_label || contact.payment_terms || '',
      shippingAddresses:  (contact.addresses || []).filter(a => !a.address_type || a.address_type === 'shipping'),
      billingAddress:     contact.billing_address || {},
      casesForFreeFreight: cf(contact, 'Cases for Free Freight'),
      methodIfFreight:    cf(contact, 'Method if Freight'),
      freightAccountNumber: cf(contact, 'Freight Account Number'),
      methodIfParcel:     cf(contact, 'Method if Parcel'),
      parcelAccountNumber: cf(contact, 'Parcel Account Number'),
      parcelPricePerLb:   cf(contact, 'Parcel Price per LB'),
      freightPricePerLb:  cf(contact, 'Freight Price per LB'),
      discount:           contact.discount || cf(contact, 'Discount'),
      remarks:            contact.notes || cf(contact, 'Remarks'),
      currencyCode:       contact.currency_code || contact.currency_id || 'USD',
    };
    return { statusCode: 200, headers, body: JSON.stringify(customer) };
  } catch (err) {
    console.error('zoho-customer error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
