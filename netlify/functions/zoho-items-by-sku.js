const { zohoGet, headers, checkEnv } = require('./zoho-utils');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Zoho GET with retry + exponential backoff for transient auth/rate/timeout hiccups.
async function zohoGetRetry(path, attempts = 3) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    try {
      return await zohoGet(path);
    } catch (e) {
      lastErr = e;
      if (a < attempts - 1) await sleep(300 * Math.pow(2, a) + Math.random() * 150);
    }
  }
  throw lastErr;
}

// Look up one SKU (search → detail) and build its detail record. Throws on failure
// so the caller can retry the SKU rather than silently dropping it.
async function fetchOne(sku) {
  const search = await zohoGetRetry(`/items?sku=${encodeURIComponent(sku)}`);
  const items = search.items || [];
  const found = items.find(it => it.sku === sku) || items[0];
  if (!found) return null; // genuinely no such item — not a transient failure

  const detail = await zohoGetRetry(`/items/${found.item_id}`);
  const item = detail.item;
  if (!item) throw new Error(`No detail returned for ${sku}`);

  const cf = (...labels) => {
    for (const label of labels) {
      const f = item.custom_fields?.find(f => f.label === label);
      if (f && f.value !== undefined && f.value !== '') return f.value;
    }
    return '';
  };
  const stockField = (...keys) => {
    for (const k of keys) {
      if (item[k] !== undefined && item[k] !== null && item[k] !== '') return Number(item[k]);
    }
    return null;
  };

  // "Available for Sale" as shown in Zoho = stock on hand − committed stock.
  // Compute it directly so committed (already-promised) quantity is reflected
  // and can go negative; fall back to Zoho's available_stock fields if the
  // components aren't both returned.
  const onHand    = stockField('stock_on_hand');
  const committed = stockField('committed_stock', 'actual_committed_stock');
  const availableForSale = (onHand != null && committed != null)
    ? onHand - committed
    : stockField('available_stock', 'actual_available_stock', 'stock_on_hand');

  return {
    sku:            item.sku || sku,
    id:             item.item_id,
    name:           item.name,
    description:    item.sales_description || item.description || item.name || '',
    unit:           item.unit || '',
    unitsPerCase:   cf('Units per Case', 'Units per Carton', 'Units/Case', 'Units/Carton'),
    weightPerCase:  cf('Weight per Case (LBS)', 'Weight Per Case (LBS)', 'Weight per Case', 'Weight Per Carton (LBS)'),
    casesPerPallet: cf('Cases per Pallet', 'Cartons per Pallet', 'Cases/Pallet', 'Cartons/Pallet'),
    availableStock: availableForSale,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    const { skus } = JSON.parse(event.body || '{}');
    if (!skus?.length) return { statusCode: 200, headers, body: JSON.stringify([]) };

    const results = [];
    let pending = [...skus];

    // Up to 2 passes: each call is already retried inside fetchOne; this re-tries
    // any SKU whose lookup still failed (so a transient hiccup can't drop an item).
    for (let pass = 0; pass < 2 && pending.length; pass++) {
      const stillFailed = [];
      for (let i = 0; i < pending.length; i += 5) {
        const batch = pending.slice(i, i + 5);
        const settled = await Promise.allSettled(batch.map(fetchOne));
        settled.forEach((r, j) => {
          if (r.status === 'fulfilled') {
            if (r.value) results.push(r.value);
            // r.value === null => no such item; don't retry
          } else {
            stillFailed.push(batch[j]);
          }
        });
      }
      pending = stillFailed;
      if (pending.length) await sleep(400);
    }

    return { statusCode: 200, headers, body: JSON.stringify(results) };
  } catch (err) {
    console.error('zoho-items-by-sku error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
