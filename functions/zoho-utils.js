// Shared Zoho token utility for Netlify functions
// Supports all Zoho regions via ZOHO_DOMAIN env var (default: zoho.com)

let cachedToken = null;
let tokenExpiry = 0;

function getZohoDomain() {
  // Set ZOHO_DOMAIN in Netlify env vars if not on US servers, e.g.:
  //   zoho.eu        → EU
  //   zoho.in        → India
  //   zoho.com.au    → Australia
  //   zohocloud.ca   → Canada
  return process.env.ZOHO_DOMAIN || 'zoho.com';
}

const DEFAULT_SCOPE = 'ZohoInventory.contacts.READ,ZohoInventory.contacts.UPDATE,ZohoInventory.items.READ,ZohoInventory.salesorders.CREATE,ZohoInventory.salesorders.READ';

async function getZohoAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const domain = getZohoDomain();
  const tokenUrl = `https://accounts.${domain}/oauth/v2/token`;

  let params;
  if (process.env.ZOHO_REFRESH_TOKEN) {
    // Refresh-token grant (requires a one-time grant code to mint the refresh token).
    params = new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id:     process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type:    'refresh_token',
    });
  } else {
    // Client-credentials grant — no grant code or refresh token needed.
    // Requires ZOHO_ORGANIZATION_ID (used as the soid) and the desired scopes.
    params = new URLSearchParams({
      client_id:     process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type:    'client_credentials',
      scope:         process.env.ZOHO_SCOPE || DEFAULT_SCOPE,
      soid:          `ZohoInventory.${process.env.ZOHO_ORGANIZATION_ID}`,
    });
  }

  console.log(`[zoho] Fetching token from: ${tokenUrl} (grant=${params.get('grant_type')})`);

  const res  = await fetch(`${tokenUrl}?${params}`, { method: 'POST' });
  const data = await res.json();

  console.log(`[zoho] Token response keys: ${Object.keys(data).join(', ')}`);

  if (!data.access_token) {
    throw new Error(`Failed to get Zoho access token from ${tokenUrl}: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

async function zohoGet(path) {
  const token  = await getZohoAccessToken();
  const domain = getZohoDomain();
  const orgId  = process.env.ZOHO_ORGANIZATION_ID;
  const sep    = path.includes('?') ? '&' : '?';
  // Use zohoapis.com for US, zohoapis.eu for EU, etc.
  const apiDomain = domain === 'zoho.com' ? 'zohoapis.com'
    : domain === 'zoho.eu'     ? 'zohoapis.eu'
    : domain === 'zoho.in'     ? 'zohoapis.in'
    : domain === 'zoho.com.au' ? 'zohoapis.com.au'
    : domain === 'zohocloud.ca'? 'zohoapis.ca'
    : 'zohoapis.com';

  const url = `https://www.${apiDomain}/inventory/v1${path}${sep}organization_id=${orgId}`;
  console.log(`[zoho] GET ${url.replace(orgId, '[orgId]')}`);

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) throw new Error(`Zoho GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function zohoPut(path, body) {
  const token  = await getZohoAccessToken();
  const domain = getZohoDomain();
  const orgId  = process.env.ZOHO_ORGANIZATION_ID;
  const sep    = path.includes('?') ? '&' : '?';
  const apiDomain = domain === 'zoho.com' ? 'zohoapis.com'
    : domain === 'zoho.eu'     ? 'zohoapis.eu'
    : domain === 'zoho.in'     ? 'zohoapis.in'
    : domain === 'zoho.com.au' ? 'zohoapis.com.au'
    : domain === 'zohocloud.ca'? 'zohoapis.ca'
    : 'zohoapis.com';

  const url = `https://www.${apiDomain}/inventory/v1${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Zoho PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function zohoPost(path, body) {
  const token  = await getZohoAccessToken();
  const domain = getZohoDomain();
  const orgId  = process.env.ZOHO_ORGANIZATION_ID;
  const sep    = path.includes('?') ? '&' : '?';
  const apiDomain = domain === 'zoho.com' ? 'zohoapis.com'
    : domain === 'zoho.eu'     ? 'zohoapis.eu'
    : domain === 'zoho.in'     ? 'zohoapis.in'
    : domain === 'zoho.com.au' ? 'zohoapis.com.au'
    : domain === 'zohocloud.ca'? 'zohoapis.ca'
    : 'zohoapis.com';

  const url = `https://www.${apiDomain}/inventory/v1${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoho POST ${path} → ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function zohoUpload(path, { fieldName, filename, buffer, contentType }) {
  const token  = await getZohoAccessToken();
  const domain = getZohoDomain();
  const orgId  = process.env.ZOHO_ORGANIZATION_ID;
  const sep    = path.includes('?') ? '&' : '?';
  const apiDomain = domain === 'zoho.com' ? 'zohoapis.com'
    : domain === 'zoho.eu'     ? 'zohoapis.eu'
    : domain === 'zoho.in'     ? 'zohoapis.in'
    : domain === 'zoho.com.au' ? 'zohoapis.com.au'
    : domain === 'zohocloud.ca'? 'zohoapis.ca'
    : 'zohoapis.com';

  const url = `https://www.${apiDomain}/inventory/v1${path}${sep}organization_id=${orgId}`;
  const form = new FormData();
  form.append(fieldName, new Blob([buffer], { type: contentType }), filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoho UPLOAD ${path} → ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const headers = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

function checkEnv() {
  // client_id, client_secret, org_id are always required. The refresh token is
  // only needed for the refresh-token grant; without it we use client_credentials.
  const required = ['ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_ORGANIZATION_ID'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

module.exports = { zohoGet, zohoPut, zohoPost, zohoUpload, headers, checkEnv, getZohoDomain };
