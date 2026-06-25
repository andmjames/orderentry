// Push an approved order to Zoho Inventory as a Sales Order.
const { zohoPut, zohoPost, headers, checkEnv } = require('./zoho-utils');

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

    // Zoho rejects an inline shipping_address on a sales order that serializes to
    // 100+ characters (error code 15). Instead, save the ship-to onto the contact's
    // (singular) shipping_address — which has no such limit — and let the sales order
    // inherit it. This mirrors the working approach used in the Customer Pricing App.
    if (order.shipping_address && typeof order.shipping_address === 'object') {
      const a = order.shipping_address;
      const shipping_address = {
        attention: a.attention || '',
        address:   a.address   || '',
        street2:   a.street2   || '',
        city:      a.city      || '',
        state:     a.state     || '',
        zip:       a.zip       || '',
        country:   a.country   || 'USA',
        phone:     a.phone     || '',
        fax:       '',
      };
      try {
        await zohoPut(`/contacts/${order.customer_id}`, { shipping_address });
      } catch (e) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Could not save shipping address to customer: ${e.message}` }) };
      }
    }

    const result = await zohoPost('/salesorders', body);

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
