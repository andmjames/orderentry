const { zohoGet, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    const { skus } = JSON.parse(event.body || '{}');
    if (!skus?.length) return { statusCode: 200, headers, body: JSON.stringify([]) };

    const results = [];

    for (let i = 0; i < skus.length; i += 5) {
      const batch = skus.slice(i, i + 5);
      const settled = await Promise.allSettled(
        batch.map(sku => zohoGet(`/items?sku=${encodeURIComponent(sku)}`))
      );

      const detailFetches = [];
      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        const sku = batch[j];
        if (r.status !== 'fulfilled') continue;
        const items = r.value.items || [];
        const item = items.find(it => it.sku === sku) || items[0];
        if (!item) continue;
        detailFetches.push({ sku, item_id: item.item_id });
      }

      const detailSettled = await Promise.allSettled(
        detailFetches.map(({ item_id }) => zohoGet(`/items/${item_id}`))
      );

      for (let j = 0; j < detailSettled.length; j++) {
        const r = detailSettled[j];
        const { sku } = detailFetches[j];
        if (r.status !== 'fulfilled') continue;
        const item = r.value.item;
        if (!item) continue;

        const cf = (...labels) => {
          for (const label of labels) {
            const f = item.custom_fields?.find(f => f.label === label);
            if (f && f.value !== undefined && f.value !== '') return f.value;
          }
          return '';
        };

        results.push({
          sku:            item.sku || sku,
          id:             item.item_id,
          name:           item.name,
          description:    item.sales_description || item.description || item.name || '',
          unit:           item.unit || '',
          unitsPerCase:   cf('Units per Case', 'Units per Carton', 'Units/Case', 'Units/Carton'),
          weightPerCase:  cf('Weight per Case (LBS)', 'Weight Per Case (LBS)', 'Weight per Case', 'Weight Per Carton (LBS)'),
          casesPerPallet: cf('Cases per Pallet', 'Cartons per Pallet', 'Cases/Pallet', 'Cartons/Pallet'),
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(results) };
  } catch (err) {
    console.error('zoho-items-by-sku error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
