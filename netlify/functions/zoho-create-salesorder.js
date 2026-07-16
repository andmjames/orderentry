// Push an approved order to Zoho Inventory as a Sales Order.
const { zohoPost, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    checkEnv();
    const order = JSON.parse(event.body || '{}');

    if (!order.customer_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'customer_id required' }) };
    }
    if (!Array.isArray(order.line_items) || order.line_items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'line_items required' }) };
    }

    const body = {
      customer_id: order.customer_id,
      date: order.date || new Date().toISOString().slice(0, 10),
      reference_number: order.reference_number || '',
      line_items: order.line_items.map(li => {
        const item = {
          item_id:  li.item_id,
          quantity: Number(li.quantity) || 0,
          rate:     Number(li.rate) || 0,
        };
        if (li.name)        item.name = li.name;
        if (li.description) item.description = li.description;
        if (li.unit)        item.unit = li.unit;
        return item;
      }),
    };

    if (order.shipping_charge !== undefined && order.shipping_charge !== null) {
      body.shipping_charge = Number(order.shipping_charge) || 0;
    }
    if (order.delivery_method) body.delivery_method = String(order.delivery_method);
    if (order.notes) body.notes = String(order.notes);

    // Ship-to handling — never overwrites the customer's primary address. Send the
    // address INLINE on the sales order first (no side effects on the contact). Zoho
    // rejects very long inline addresses (error 15); if that happens, save the ship-to
    // as an ADDITIONAL address on the contact and reference it by id.
    let shipAddr = null;
    if (order.shipping_address && typeof order.shipping_address === 'object') {
      const a = order.shipping_address;
      shipAddr = {
        attention: a.attention || '',
        address:   a.address   || '',
        street2:   a.street2   || '',
        city:      a.city      || '',
        state:     a.state     || '',
        zip:       a.zip       || '',
        country:   a.country   || 'USA',
        phone:     a.phone     || '',
      };
    }

    let result;
    if (shipAddr) {
      try {
        result = await zohoPost('/salesorders', { ...body, shipping_address: shipAddr });
      } catch (inlineErr) {
        // Inline rejected (likely too long). Save as an ADDITIONAL contact address and
        // reference it by id — this does NOT overwrite the customer's primary address.
        let addressId = null;
        try {
          const addRes = await zohoPost(`/contacts/${order.customer_id}/address`, shipAddr);
          const info = addRes.address_info || addRes.address || {};
          addressId = info.address_id || addRes.address_id || null;
        } catch (e) {
          return { statusCode: 502, headers, body: JSON.stringify({ error: `Could not save shipping address to customer: ${e.message}` }) };
        }
        result = await zohoPost('/salesorders', addressId ? { ...body, shipping_address_id: addressId } : body);
      }
    } else {
      result = await zohoPost('/salesorders', body);
    }

    const so = result.salesorder || {};

    // Add the pallets / weight / cases as a comment on the sales order.
    let commentAdded = false;
    if (order.comment && so.salesorder_id) {
      try {
        await zohoPost(`/salesorders/${so.salesorder_id}/comments`, { description: String(order.comment) });
        commentAdded = true;
      } catch (e) {
        console.error('Could not add sales order comment:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        salesorder_id:     so.salesorder_id || null,
        salesorder_number: so.salesorder_number || null,
        status:            so.status || null,
        total:             so.total || null,
        comment_added:     commentAdded,
        raw_message:       result.message || null,
      }),
    };
  } catch (err) {
    console.error('zoho-create-salesorder error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
