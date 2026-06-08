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
  return apiFetch('/zoho-items-by-sku', {
    method: 'POST',
    body: JSON.stringify({ skus }),
  });
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
