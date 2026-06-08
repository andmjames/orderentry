// Pure, deterministic order math — no network. Kept separate so the logic is
// easy to read and adjust. The AI only identifies the customer, extracts the PO
// lines, and matches them to the catalog; all pricing/freight math lives here.

const CURRENCY_SYMBOLS = {
  USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$',
  NOK: 'kr', SEK: 'kr', DKK: 'kr', JPY: '¥', CNY: '¥',
  CHF: 'CHF', MXN: 'MX$', BRL: 'R$', INR: '₹', ZAR: 'R',
};

export function currencySymbol(code = 'USD') {
  return CURRENCY_SYMBOLS[code] || (code ? code + ' ' : '$');
}

export function money(val, code = 'USD') {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return `${currencySymbol(code)}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function num(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? fallback : n;
}

// Build {item_number -> {alias, tiers:[{min_cases, price}]}} from Supabase rows.
export function groupPricing(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.item_number || r.item_id;
    if (!key) continue;
    if (!map.has(key)) map.set(key, { item_number: key, alias: r.alias || '', tiers: [] });
    map.get(key).tiers.push({ min_cases: num(r.min_cases, 1), price: num(r.price, null) });
    if (r.alias && !map.get(key).alias) map.get(key).alias = r.alias;
  }
  for (const v of map.values()) v.tiers.sort((a, b) => a.min_cases - b.min_cases);
  return map;
}

// Pick the unit price for a given case quantity (highest tier whose min_cases <= cases).
export function priceForCases(tiers, cases) {
  if (!tiers || !tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.min_cases - b.min_cases);
  let chosen = sorted[0];
  for (const t of sorted) if (cases >= t.min_cases) chosen = t;
  return chosen;
}

// Build the full set of order lines from matched data.
// match: { item_number, ordered_quantity }  (units of the catalog item — preferred)
//   or  { item_number, ordered_cases }       (whole/partial cases — fallback)
// pricingMap: from groupPricing()
// itemDetails: [{ sku, id, name, description, unit, unitsPerCase, weightPerCase, casesPerPallet }]
export function buildOrderLines(matches, pricingMap, itemDetails) {
  const detailBySku = new Map(itemDetails.map(d => [d.sku, d]));
  const lines = [];
  for (const m of matches) {
    const priced = pricingMap.get(m.item_number);
    const detail = detailBySku.get(m.item_number) || {};
    const unitsPerCase = num(detail.unitsPerCase, 0);

    // Preserve the actual ordered quantity. Never round it up to a whole case.
    let qty, cases;
    if (m.ordered_quantity != null && m.ordered_quantity !== '') {
      qty = Math.max(0, num(m.ordered_quantity, 0));
      cases = unitsPerCase > 0 ? qty / unitsPerCase : qty;
    } else {
      cases = Math.max(0, num(m.ordered_cases, 0));
      qty = unitsPerCase > 0 ? cases * unitsPerCase : cases;
    }
    cases = Math.round(cases * 100) / 100;
    qty = Math.round(qty * 100) / 100;

    const tier = priced ? priceForCases(priced.tiers, cases) : null;
    const unitPrice = tier ? tier.price : null;
    lines.push({
      item_number:   m.item_number,
      item_id:       detail.id || null,
      alias:         priced?.alias || '',
      description:   detail.description || '',
      unit:          detail.unit || '',
      unitsPerCase,
      weightPerCase: num(detail.weightPerCase, 0),
      casesPerPallet:num(detail.casesPerPallet, 0),
      availableStock: (detail.availableStock === null || detail.availableStock === undefined) ? null : Number(detail.availableStock),
      cases,
      qty,
      unitPrice,
      total:         unitPrice != null ? qty * unitPrice : null,
      tierMinCases:  tier ? tier.min_cases : null,
      missingPrice:  unitPrice == null,
      missingUnits:  unitsPerCase <= 0,
    });
  }
  return lines;
}

export function recomputeLine(line) {
  const qty = line.unitsPerCase > 0 ? line.cases * line.unitsPerCase : line.cases;
  return { ...line, qty, total: line.unitPrice != null ? qty * line.unitPrice : null };
}

// ── Shipping address matching ────────────────────────────────────────────────

// Title-case free-text address parts (e.g. "JCAR LOGO GEAR" → "Jcar Logo Gear").
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}
// Keep short codes (state/country abbreviations) uppercase; title-case longer names.
function normalizeCode(s) {
  const t = String(s || '').trim();
  return t.length <= 3 ? t.toUpperCase() : titleCase(t);
}

export function normalizeCountry(c) {
  if (!c) return c;
  const k = String(c).toLowerCase().replace(/[.\s]/g, '');
  if (k === 'us' || k === 'usa' || k === 'unitedstates' || k === 'unitedstatesofamerica') return 'U.S.A';
  return c;
}

export function formatAddress(a) {
  if (!a) return '';
  const street = [a.address || a.street, a.street2].filter(Boolean).join(', ');
  const cityState = [a.city, a.state].filter(Boolean).join(', ');
  const tail = [cityState, a.zip].filter(Boolean).join(' ');
  const out = [a.attention, street, tail, normalizeCountry(a.country)].filter(Boolean).join(' · ');
  return out || a.text || '';
}

function addrTokens(a) {
  const s = [a.attention, a.address || a.street, a.street2, a.city, a.state, a.zip, a.country, a.text]
    .filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  return new Set(s.split(/\s+/).filter(Boolean));
}

// 0..1 similarity between a PO ship-to and an existing address (zip match is a strong signal).
export function scoreAddressMatch(po, ex) {
  const A = addrTokens(po), B = addrTokens(ex);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  const jacc = inter / (A.size + B.size - inter);
  const pz = String(po.zip || '').replace(/\D/g, '').slice(0, 5);
  const ez = String(ex.zip || '').replace(/\D/g, '').slice(0, 5);
  const zipEq = pz && ez && pz === ez;
  return zipEq ? Math.max(jacc, 0.6) : jacc;
}

// Build the dropdown options and pick a selection. If no existing address is a
// close match to the PO ship-to, a new option (from the PO) is added and selected.
export function pickShippingAddress(poAddr, existing) {
  const list = (existing || []).map((a, i) => ({
    id: a.address_id || `ex-${i}`,
    label: formatAddress(a),
    addr: a,
    isNew: false,
  }));

  const hasPo = poAddr && (poAddr.address || poAddr.street || poAddr.city || poAddr.zip || poAddr.text);
  if (!hasPo) return { options: list, selectedId: list[0]?.id || '', matchedExisting: null, score: 0 };

  let best = null, bestScore = 0;
  for (const opt of list) {
    const s = scoreAddressMatch(poAddr, opt.addr);
    if (s > bestScore) { bestScore = s; best = opt; }
  }

  const THRESHOLD = 0.5;
  if (best && bestScore >= THRESHOLD) {
    return { options: list, selectedId: best.id, matchedExisting: true, score: bestScore };
  }

  const newAddr = {
    attention: titleCase(poAddr.attention || ''),
    address:   titleCase(poAddr.address || poAddr.street || ''),
    street2:   titleCase(poAddr.street2 || ''),
    city:      titleCase(poAddr.city || ''),
    state:     normalizeCode(poAddr.state || ''),
    zip:       String(poAddr.zip || '').trim(),
    country:   normalizeCode(poAddr.country || 'USA'),
  };
  const newOpt = {
    id: 'new-from-po',
    label: formatAddress(newAddr) || titleCase(poAddr.text || '') || 'New address (from PO)',
    addr: newAddr,
    isNew: true,
  };
  return { options: [newOpt, ...list], selectedId: newOpt.id, matchedExisting: false, score: bestScore };
}

// ── Shipping method, pallets, weight, and charge ─────────────────────────────

const FREIGHT_WEIGHT_THRESHOLD = 160; // >= 160 lb (product weight) → freight, else parcel
const PALLET_WEIGHT_LB = 40;          // freight adds 40 lb per pallet

export function computeShipping(customer, totals, methodOverride, poAccounts) {
  const c = customer || {};
  const po = poAccounts || {};
  const parcelPerLb  = num(c.parcelPricePerLb, 0);
  const freightPerLb = num(c.freightPricePerLb, 0);
  const baseWeight = totals.baseWeight || 0;

  // Method decided by product (pre-pallet) weight; can be overridden manually.
  const methodType = methodOverride || (baseWeight >= FREIGHT_WEIGHT_THRESHOLD ? 'freight' : 'parcel');

  // Pallets: parcel = 0; freight = ceil( Σ cases / cases-per-pallet ).
  let pallets = 0;
  if (methodType === 'freight') {
    pallets = totals.palletFraction > 0
      ? Math.ceil(totals.palletFraction)
      : (totals.cases > 0 ? 1 : 0);
  }

  // Freight adds 40 lb per pallet to the shipment weight.
  const palletWeight = methodType === 'freight' ? pallets * PALLET_WEIGHT_LB : 0;
  const weight = Math.round((baseWeight + palletWeight) * 100) / 100;

  // Account number for the active method. A different account listed on the PO
  // overrides the one on file (for this order).
  const onFileAccount = methodType === 'freight'
    ? (c.freightAccountNumber || '')
    : (c.parcelAccountNumber || '');
  const poAccount = String((methodType === 'freight' ? po.freight : po.parcel) || '').trim();
  const norm = s => String(s || '').toLowerCase().replace(/\s/g, '');
  const accountFromPo = !!poAccount && norm(poAccount) !== norm(onFileAccount);
  const account = poAccount || onFileAccount;
  const hasAccount = !!String(account).trim();

  // Charge rules:
  //  - account on file (for the chosen method) → 0.00
  //  - freight, no freight account → weight × Freight $/LB
  //  - parcel,  no parcel account  → weight × Parcel $/LB
  let freightCharge, chargeBasis;
  if (hasAccount) {
    freightCharge = 0;
    chargeBasis = `Billed to ${methodType} account ${accountFromPo ? 'from PO' : 'on file'}`;
  } else {
    const perLb = methodType === 'freight' ? freightPerLb : parcelPerLb;
    const label = methodType === 'freight' ? 'Freight $/LB' : 'Parcel $/LB';
    freightCharge = weight * perLb;
    chargeBasis = `${weight} lb × ${currencySymbol(c.currencyCode || 'USD')}${perLb}/lb (${label})`;
  }
  freightCharge = Math.round(freightCharge * 100) / 100;

  const shippingMethod = methodType === 'freight'
    ? (c.methodIfFreight || 'LTL')
    : (c.methodIfParcel || 'Parcel');

  return {
    methodType, shippingMethod, shippingAccount: account, hasAccount, accountFromPo,
    pallets, baseWeight: Math.round(baseWeight * 100) / 100, palletWeight,
    weight, freightCharge, chargeBasis,
  };
}

// Roll up line-level numbers. Weight here is the product (pre-pallet) weight;
// pallet weight is added later in computeShipping for freight only.
export function computeTotals(lines) {
  let cases = 0, units = 0, baseWeight = 0, palletFraction = 0, subtotal = 0;
  for (const l of lines) {
    cases  += l.cases;
    units  += l.qty;
    baseWeight += l.cases * l.weightPerCase;
    if (l.casesPerPallet > 0) palletFraction += l.cases / l.casesPerPallet;
    if (l.total != null) subtotal += l.total;
  }
  return {
    cases,
    units,
    baseWeight: Math.round(baseWeight * 100) / 100,
    palletFraction,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}
