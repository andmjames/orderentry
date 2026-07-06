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

    // Zoho stores a contact's primary shipping/billing addresses separately from the
    // `addresses` array (which holds only ADDITIONAL addresses). Include the primary
    // shipping address as a selectable option, plus any additional shipping addresses,
    // and fall back to the billing address if there's no shipping address at all.
    const hasAddr = a => a && (a.address || a.street2 || a.city || a.zip || a.attention);
    const primaryShip = contact.shipping_address || {};
    const primaryBill = contact.billing_address || {};
    const addrCandidates = [];
    if (hasAddr(primaryShip)) addrCandidates.push({ ...primaryShip, address_id: primaryShip.address_id || 'primary-shipping' });
    for (const a of (contact.addresses || [])) {
      if ((!a.address_type || a.address_type === 'shipping') && hasAddr(a)) addrCandidates.push(a);
    }
    if (addrCandidates.length === 0 && hasAddr(primaryBill)) {
      addrCandidates.push({ ...primaryBill, address_id: primaryBill.address_id || 'primary-billing' });
    }
    const seenAddr = new Set();
    const shippingAddresses = addrCandidates.filter(a => {
      const k = a.address_id || `${a.address || ''}|${a.zip || ''}`;
      if (seenAddr.has(k)) return false;
      seenAddr.add(k);
      return true;
    });

    const customer = {
      id:                 contact.contact_id,
      name:               contact.contact_name,
      paymentTerms:       contact.payment_terms_label || contact.payment_terms || '',
      shippingAddresses,
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
