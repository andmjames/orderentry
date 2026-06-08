// API helpers for the Order Entry App.
// All network calls go through Netlify serverless functions so credentials
// (Zoho OAuth + Anthropic API key) never reach the browser.

const API_BASE = '/.netlify/functions';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { detail = await res.text(); }
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Customers ────────────────────────────────────────────────────────────────
export async function fetchAllCustomers() {
  return apiFetch('/zoho-customers');
}

export async function fetchCustomer(customerId) {
  return apiFetch(`/zoho-customer?id=${encodeURIComponent(customerId)}`);
}

// ── Items ────────────────────────────────────────────────────────────────────
export async function fetchItemDetailsBySku(skus) {
  if (!skus || !skus.length) return [];
  const attempts = 3;
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    try {
      const res = await apiFetch('/zoho-items-by-sku', {
        method: 'POST',
        body: JSON.stringify({ skus }),
      });
      const arr = Array.isArray(res) ? res : [];
      // Treat a systemically-empty result (nothing came back, or every item is
      // missing all Zoho detail fields) as a transient failure worth retrying —
      // that's the "all columns blank / no units/case" symptom.
      const noneUsable = arr.length === 0 || arr.every(d =>
        (d.unitsPerCase === '' || d.unitsPerCase == null) &&
        (d.weightPerCase === '' || d.weightPerCase == null) &&
        (d.availableStock == null)
      );
      if (!noneUsable || a === attempts - 1) return arr;
    } catch (e) {
      lastErr = e;
      if (a === attempts - 1) throw e;
    }
    await new Promise(r => setTimeout(r, 400 * Math.pow(2, a) + Math.random() * 200));
  }
  if (lastErr) throw lastErr;
  return [];
}

// ── Claude (Sonnet) PO analysis ──────────────────────────────────────────────
export async function analyzePo({ fileBase64, mediaType, customers }) {
  return apiFetch('/po-analyze', {
    method: 'POST',
    body: JSON.stringify({ fileBase64, mediaType, customers }),
  });
}

export async function matchOrder({ lineItems, catalog }) {
  return apiFetch('/po-match', {
    method: 'POST',
    body: JSON.stringify({ lineItems, catalog }),
  });
}

// ── Sales order ──────────────────────────────────────────────────────────────
export async function createSalesOrder(order) {
  return apiFetch('/zoho-create-salesorder', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export async function checkDuplicatePo({ customerId, poNumber }) {
  const qs = `?customer_id=${encodeURIComponent(customerId)}&po_number=${encodeURIComponent(poNumber)}`;
  return apiFetch(`/zoho-check-po${qs}`);
}

export async function attachSalesOrderPdf({ salesorderId, filename, pdfBase64 }) {
  return apiFetch('/zoho-attach-salesorder', {
    method: 'POST',
    body: JSON.stringify({ salesorder_id: salesorderId, filename, pdf_base64: pdfBase64, content_type: 'application/pdf' }),
  });
}

export async function attachSalesOrderFile({ salesorderId, filename, fileBase64, contentType }) {
  return apiFetch('/zoho-attach-salesorder', {
    method: 'POST',
    body: JSON.stringify({ salesorder_id: salesorderId, filename, file_base64: fileBase64, content_type: contentType }),
  });
}
