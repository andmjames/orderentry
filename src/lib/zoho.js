// API helpers for the Order Entry App.
// All network calls go through Netlify serverless functions so credentials
// (Zoho OAuth + Anthropic API key) never reach the browser.

const API_BASE = '/.netlify/functions';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // Read the body ONCE as text. A Response body is a stream and can only be consumed
  // a single time — calling res.json() and then res.text() throws "body stream already
  // read", which masks the real error (e.g. a function timeout returning an HTML page).
  const raw = await res.text();

  if (!res.ok) {
    let detail = '';
    try { detail = (JSON.parse(raw) || {}).error || ''; } catch { detail = ''; }
    if (!detail) {
      const snippet = String(raw || '').trim().slice(0, 300);
      detail = snippet || `API error ${res.status}`;
      if (res.status === 502 || res.status === 504) {
        detail = `The request timed out or the server errored (${res.status}). ${snippet}`.trim();
      }
    }
    throw new Error(detail);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Unexpected non-JSON response from ${path}: ${String(raw).trim().slice(0, 300)}`);
  }
}

// ── Customers ────────────────────────────────────────────────────────────────
export async function fetchAllCustomers() {
  return apiFetch('/zoho-customers');
}

export async function fetchCustomer(customerId) {
  return apiFetch(`/zoho-customer?id=${encodeURIComponent(customerId)}`);
}

// Credit-hold status derived from the customer's overdue invoices in Zoho.
export async function fetchCustomerCreditStatus(customerId) {
  return apiFetch(`/zoho-invoices?id=${encodeURIComponent(customerId)}`);
}

// Adds a new shipping address to the customer's contact record in Zoho.
export async function addCustomerAddress(customerId, address) {
  return apiFetch('/zoho-add-address', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId, address }),
  });
}

// Looks up an existing sales order's internal id from its number.
export async function findSalesOrderByNumber(number) {
  return apiFetch(`/zoho-find-salesorder?number=${encodeURIComponent(number)}`);
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
      // Retry if the result looks transiently incomplete: nothing came back,
      // every item is missing all Zoho detail fields, OR some requested SKU is
      // absent from the response (a dropped lookup we'd otherwise lose silently).
      const returned = new Set(arr.map(d => d && d.sku));
      const missingSome = skus.some(s => !returned.has(s));
      const noneUsable = arr.length === 0 || arr.every(d =>
        (d.unitsPerCase === '' || d.unitsPerCase == null) &&
        (d.weightPerCase === '' || d.weightPerCase == null) &&
        (d.availableStock == null)
      );
      const incomplete = noneUsable || missingSome;
      if (!incomplete || a === attempts - 1) return arr;
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
