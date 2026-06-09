import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCustomer, fetchItemDetailsBySku, matchOrder, createSalesOrder, checkDuplicatePo, attachSalesOrderPdf, attachSalesOrderFile, addCustomerAddress, findSalesOrderByNumber } from '../lib/zoho';
import { fetchCustomerPricing } from '../lib/supabase';
import { buildPackingPdf } from '../lib/packingPdf';
import { buildPalletLabelsPdf } from '../lib/palletPdf';
import {
  groupPricing, buildOrderLines, priceForCases,
  computeTotals, computeShipping, num, money, round2,
  pickShippingAddress, formatAddress, normalizeCountry,
} from '../lib/order';
import { isPlasticPalletCustomer } from '../lib/plasticPallets';
import OrderSummary from './OrderSummary';
import OrderItemsTable from './OrderItemsTable';
import AddItemsTable from './AddItemsTable';
import PricingAppModal from './PricingAppModal';
import PackingList from './PackingList';
import PalletLabels from './PalletLabels';
import { useToast } from './Toast';

const PRICING_APP_URL = process.env.REACT_APP_PRICING_APP_URL || '';

// Break a shipping address into label lines: name, street, street2, "city, ST zip", country.
function shipToLines(addr, fallbackName) {
  if (!addr) return [fallbackName].filter(Boolean);
  const lines = [];
  const name = addr.attention || fallbackName;
  if (name) lines.push(name);
  if (addr.address) lines.push(addr.address);
  if (addr.street2) lines.push(addr.street2);
  const cityLine = [[addr.city, addr.state].filter(Boolean).join(', '), addr.zip].filter(Boolean).join(' ').trim();
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(normalizeCountry(addr.country));
  return lines;
}

// Long date with ordinal, e.g. "March 23rd, 2026" — used as the BOL document date.
function longDateOrdinal(d = new Date()) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = d.getDate();
  const ones = day % 10, tens = day % 100;
  const ord = (tens >= 11 && tens <= 13) ? 'th'
    : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
  return `${months[d.getMonth()]} ${day}${ord}, ${d.getFullYear()}`;
}

// Build the display catalog + price-break levels from pricing rows + Zoho item details.
function buildCatalogDisplay(pmap, details) {
  const detailBySku = new Map(details.map(d => [d.sku, d]));
  const levels = [...new Set([...pmap.values()].flatMap(p => p.tiers.map(t => t.min_cases)))]
    .sort((a, b) => a - b);
  const display = [...pmap.values()].map(p => {
    const d = detailBySku.get(p.item_number) || {};
    const tierByMin = {};
    p.tiers.forEach(t => { tierByMin[t.min_cases] = t.price; });
    return {
      item_number:    p.item_number,
      alias:          p.alias || '',
      unit:           d.unit || '',
      description:    d.description || '',
      unitsPerCase:   num(d.unitsPerCase, 0),
      weightPerCase:  num(d.weightPerCase, 0),
      casesPerPallet: num(d.casesPerPallet, 0),
      tierByMin,
      item_id:        d.id || null,
    };
  }).sort((a, b) => String(a.item_number).localeCompare(String(b.item_number)));
  return { display, levels };
}

// Price breaks are reached by the COMBINED order, not per item: a customer can
// mix different items to hit a tier. So pick every line's price-break tier from
// the total case count across all lines, then reprice each line at that tier.
function applyOrderTierPricing(lines, pmap) {
  const totalCases = lines.reduce((s, l) => s + (Number(l.cases) || 0), 0);
  return lines.map(l => {
    const priced = pmap.get(l.item_number);
    if (!priced) return l;
    const tier = priceForCases(priced.tiers, totalCases);
    const unitPrice = tier ? round2(tier.price) : l.unitPrice;
    const qty = Number(l.qty) || 0;
    return {
      ...l,
      unitPrice,
      total: unitPrice != null ? round2(qty * unitPrice) : null,
      tierMinCases: tier ? tier.min_cases : l.tierMinCases,
      missingPrice: unitPrice == null,
    };
  });
}

// Build the packing-list and pallet-label data objects. Shared by the new-order
// flow and the Sales Order reprint flow so both produce identical documents
// (same special notes, same BOL, same format).
function buildDocs({ customer, shipping, totals, poNumber, invoiceNumber, shipAddr, docLines }) {
  // One USMCA row per unique item.
  const seen = new Set();
  const usmcaItems = [];
  docLines.forEach(l => {
    if (!seen.has(l.item_number)) {
      seen.add(l.item_number);
      usmcaItems.push({ item_number: l.item_number, description: l.description || '' });
    }
  });

  const shipCountry = String(shipAddr?.country || '').trim();
  const shipsToCanada = /canada/i.test(shipCountry) || /^ca$/i.test(shipCountry);
  const menards = /menard/i.test(customer.name || '');
  const plural = (u) => { const s = u || 'Roll'; return /s$/i.test(s) ? s : s + 's'; };

  const bolDropoff = (() => {
    const a = shipAddr || {};
    const ls = shipToLines(a, customer.name);
    if (a.phone) ls.push(String(a.phone));
    return ls;
  })();
  const bolRows = docLines.map(l => {
    const isFlo = /^\s*flo2730\s*$/i.test(l.item_number || '');
    const cases = num(l.cases) || 0;
    const cpp = isFlo ? 108 : (num(l.casesPerPallet) || 0);
    const linePallets = cpp > 0 ? Math.ceil(cases / cpp) : 0;
    const pkg = [];
    if (isFlo) {
      pkg.push('12 Rolls/Case', '108 Cases/Pallet');
    } else {
      if (num(l.unitsPerCase) > 0) pkg.push(`${num(l.unitsPerCase)} ${plural(l.unit)}/Case`);
      if (num(l.casesPerPallet) > 0) pkg.push(`${num(l.casesPerPallet)} Cases/Pallet`);
    }
    if (linePallets > 0) pkg.push(`${linePallets} Pallet${linePallets === 1 ? '' : 's'}`);
    const qtyNum = num(l.qty) || 0;
    const lineWeight = Math.round(cases * (num(l.weightPerCase) || 0));
    return {
      quantity: `${qtyNum.toLocaleString('en-US')} ${qtyNum === 1 ? (l.unit || 'Roll') : plural(l.unit)}`,
      packaging: pkg,
      commodity: isFlo ? 'SKU 7091055' : (l.item_number || ''),
      weight: lineWeight > 0 ? `${lineWeight.toLocaleString('en-US')} LBS` : '',
    };
  });

  const packing = {
    customerName: customer.name,
    shipTo: shipAddr ? formatAddress(shipAddr) : '',
    invoiceNumber: invoiceNumber || '',
    poNumber,
    totals: { cases: totals.cases, pallets: shipping.pallets, weight: shipping.weight },
    palletDimensions: shipping.palletDimensions || '',
    lines: docLines.map(l => ({
      qty: l.qty, unit: l.unit, cases: l.cases,
      item_number: l.item_number, description: l.description,
    })),
    note: /ryonet/i.test(customer.name || '') ? '**Barcodes on all Rolls and Cartons**' : '',
    nazdar: /nazdar/i.test(customer.name || ''),
    imageTech: /image\s*tech/i.test(customer.name || ''),
    plasticPallets: isPlasticPalletCustomer(customer.name) && shipping.pallets > 0,
    canada: shipsToCanada,
    importerLines: shipToLines(shipAddr, customer.name),
    usmcaItems,
    menards,
    bol: menards ? { documentDate: longDateOrdinal(), poNumber, dropoffLines: bolDropoff, rows: bolRows } : null,
  };

  const pallet = (shipping.methodType === 'freight' && shipping.pallets > 0) ? {
    poNumber,
    invoiceNumber: packing.invoiceNumber,
    shipToLines: shipToLines(shipAddr, customer.name),
    palletCount: shipping.pallets,
    steve: /adidas\s*indy/i.test(customer.name || ''),
  } : null;

  return { packing, pallet };
}

export default function OrderReview({ analysis, fileName, poFile, customers, onBack }) {
  const toast = useToast();

  // Resolve the AI's customer guess to a real customer stub.
  const guessStub = customers.find(
    c => (c.name || '').toLowerCase() === (analysis.customer_name || '').toLowerCase()
  );
  const [customerId, setCustomerId] = useState(guessStub?.id || '');

  const [customer, setCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddrId, setSelectedAddrId] = useState('');
  const [addrMatched, setAddrMatched] = useState(null); // true=matched existing, false=added new
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [addingAddr, setAddingAddr] = useState(false);
  const emptyAddr = { attention: '', address: '', street2: '', city: '', state: '', zip: '', country: 'USA' };
  const [newAddr, setNewAddr] = useState(emptyAddr);
  const [lines, setLines] = useState([]);
  const [pricingMap, setPricingMap] = useState(new Map());
  const [itemDetails, setItemDetails] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [priceLevels, setPriceLevels] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showPricingApp, setShowPricingApp] = useState(false);
  const [poNumber, setPoNumber] = useState(analysis.po_number || '');
  const [freightOverride, setFreightOverride] = useState(null); // null = use calculated
  const [poDuplicate, setPoDuplicate] = useState(false);
  const [packingData, setPackingData] = useState(null);
  const [showPacking, setShowPacking] = useState(false);
  const [palletData, setPalletData] = useState(null);
  const [showPallet, setShowPallet] = useState(false);
  const [showRemarks, setShowRemarks] = useState(false);
  const [excluded, setExcluded] = useState([]);
  const [methodOverride, setMethodOverride] = useState(null);
  const [methodNameOverride, setMethodNameOverride] = useState(null); // manual carrier/method text
  const [accountOverride, setAccountOverride] = useState(null);       // manual shipping account #
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approved, setApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Sales Order reprint mode: the upload is one of our own Sales Orders, not a
  // new customer PO. We rebuild the packing list + labels and attach them to the
  // existing SO instead of creating a new order.
  const salesOrderMode = analysis.document_type === 'sales_order';
  const [soInfo, setSoInfo] = useState(null);  // { number, id }
  const soStarted = useRef(false);

  const load = useCallback(async (id) => {
    if (salesOrderMode) return; // handled by the Sales Order effect
    if (!id) { setCustomer(null); setLines([]); setExcluded([]); return; }
    setLoading(true); setError(null); setResult(null); setApproved(false);
    setMethodOverride(null); setShowPicker(false); setFreightOverride(null);
    setMethodNameOverride(null); setAccountOverride(null);
    setPalletData(null); setShowPallet(false); setShowRemarks(false);
    try {
      const cust = await fetchCustomer(id);
      setCustomer(cust);

      // Match the PO ship-to against the customer's addresses; add a new one if needed.
      const pick = pickShippingAddress(analysis.ship_to, cust.shippingAddresses || []);
      setAddresses(pick.options);
      setSelectedAddrId(pick.selectedId);
      setAddrMatched(pick.matchedExisting);

      const rows = await fetchCustomerPricing(cust.name);
      const pmap = groupPricing(rows || []);
      const skus = [...pmap.keys()];

      const details = skus.length ? await fetchItemDetailsBySku(skus) : [];

      setPricingMap(pmap);
      setItemDetails(details);

      // Display catalog for the "Customer Pricing" add-items table.
      const { display, levels } = buildCatalogDisplay(pmap, details);
      setCatalog(display);
      setPriceLevels(levels);

      // Catalog used by the AI matcher.
      const matchCatalog = display.map(p => ({
        item_number:    p.item_number,
        alias:          p.alias,
        description:    p.description,
        units_per_case: p.unitsPerCase,
        unit:           p.unit,
      }));

      const lineItems = analysis.line_items || [];
      let matchRes = { matches: [], unmatched: [] };
      if (lineItems.length && matchCatalog.length) {
        matchRes = await matchOrder({ lineItems, catalog: matchCatalog });
      }

      const built = buildOrderLines(matchRes.matches || [], pmap, details);
      setLines(applyOrderTierPricing(built, pmap));

      const unmatched = (matchRes.unmatched || []).map(u => {
        const li = lineItems[u.po_index] || {};
        return {
          identifier:  u.identifier || li.identifier || '',
          description: u.description || li.description || '',
          reason:      u.reason || '',
        };
      });
      setExcluded(unmatched);
    } catch (e) {
      setError(e.message || 'Failed to build order');
    } finally {
      setLoading(false);
    }
  }, [analysis, salesOrderMode]);

  useEffect(() => { load(customerId); }, [customerId, load]);

  // Warn if this PO number already exists for this customer in Zoho (debounced).
  useEffect(() => {
    setPoDuplicate(false);
    if (salesOrderMode || !customerId || !poNumber.trim()) return;
    let ignore = false;
    const t = setTimeout(() => {
      checkDuplicatePo({ customerId, poNumber: poNumber.trim() })
        .then(res => { if (!ignore) setPoDuplicate(!!res.duplicate); })
        .catch(() => { if (!ignore) setPoDuplicate(false); });
    }, 600);
    return () => { ignore = true; clearTimeout(t); };
  }, [customerId, poNumber, salesOrderMode]);

  // Sales Order reprint: resolve customer + item details from the uploaded SO,
  // rebuild the packing list & labels, attach them to the existing SO, and show
  // the printout. No matching, no new order is created.
  useEffect(() => {
    if (!salesOrderMode || soStarted.current) return;
    soStarted.current = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const soNumber = analysis.sales_order_number || analysis.po_number || '';
        const stub = guessStub || customers.find(
          c => (c.name || '').toLowerCase() === (analysis.customer_name || '').toLowerCase()
        );
        if (!stub) throw new Error(`Customer "${analysis.customer_name || ''}" from the Sales Order was not found in Zoho`);

        const cust = await fetchCustomer(stub.id);
        setCustomer(cust);
        setCustomerId(stub.id);

        // Ship-to comes straight from the Sales Order (it may have been edited in Zoho).
        const a = analysis.ship_to || {};
        const shipAddr = {
          attention: a.attention || cust.name,
          address:   a.address || a.street || '',
          street2:   a.street2 || '',
          city:      a.city || '',
          state:     a.state || '',
          zip:       a.zip || '',
          country:   a.country || 'USA',
          phone:     a.phone || '',
        };
        setAddresses([{ id: 'so-shipto', label: formatAddress(shipAddr), addr: shipAddr, isNew: false }]);
        setSelectedAddrId('so-shipto');

        // Pull item details for the SO's items (our exact item numbers — no matching needed).
        const items = analysis.line_items || [];
        const skus = [...new Set(items.map(i => i.identifier).filter(Boolean))];
        const details = skus.length ? await fetchItemDetailsBySku(skus) : [];
        const detBySku = new Map(details.map(d => [d.sku, d]));

        const builtLines = items.map(i => {
          const d = detBySku.get(i.identifier) || {};
          const upc = num(d.unitsPerCase, 0);
          const qty = num(i.quantity, 0);
          return {
            item_number: i.identifier,
            item_id: d.id || null,
            description: i.description || d.description || '',
            unit: i.unit_of_measure || d.unit || '',
            qty,
            cases: upc > 0 ? qty / upc : qty,
            unitsPerCase: upc,
            weightPerCase: num(d.weightPerCase, 0),
            casesPerPallet: num(d.casesPerPallet, 0),
            unitPrice: num(i.unit_price, null),
            total: null,
          };
        });
        setLines(builtLines);
        setItemDetails(details);
        setPoNumber(analysis.po_number || '');

        // Honor the SO's delivery method when deciding parcel vs freight.
        const m = String(analysis.shipping_method || '').toLowerCase();
        const methodForce = /ltl|freight|truck|ftl/.test(m) ? 'freight'
          : /parcel|ground|ups|fedex|usps/.test(m) ? 'parcel' : null;
        setMethodOverride(methodForce);

        // Build the documents from the freshly-loaded lines (don't wait on state).
        const localTotals = computeTotals(builtLines);
        const localShipping = computeShipping(cust, localTotals, methodForce, {});
        const { packing, pallet } = buildDocs({
          customer: cust, shipping: localShipping, totals: localTotals,
          poNumber: analysis.po_number || '', invoiceNumber: soNumber,
          shipAddr, docLines: builtLines,
        });
        setPackingData(packing);
        setPalletData(pallet);

        // Find the existing SO so we can attach the regenerated documents.
        let soId = null;
        try {
          const found = await findSalesOrderByNumber(soNumber);
          soId = found && found.salesorder_id ? found.salesorder_id : null;
        } catch { /* lookup failed; we'll still show the printout */ }
        setSoInfo({ number: soNumber, id: soId });

        setShowPacking(true);
        setLoading(false);

        if (soId) {
          try {
            const pdf = buildPackingPdf(packing);
            await attachSalesOrderPdf({ salesorderId: soId, filename: `Packing-List-${soNumber}.pdf`, pdfBase64: pdf });
            toast('Packing list attached to the sales order');
          } catch (e) { toast(`Could not attach packing list: ${e.message}`, 'error'); }
          if (pallet) {
            try {
              const ppdf = await buildPalletLabelsPdf(pallet);
              await attachSalesOrderPdf({ salesorderId: soId, filename: `Pallet-Labels-${soNumber}.pdf`, pdfBase64: ppdf });
              toast('Pallet labels attached to the sales order');
            } catch (e) { toast(`Could not attach pallet labels: ${e.message}`, 'error'); }
          }
        } else {
          toast(`Could not find Sales Order ${soNumber} in Zoho to attach the files`, 'error');
        }
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [salesOrderMode]);

  const currency = customer?.currencyCode || 'USD';
  const totals = computeTotals(lines);
  const poAccounts = {
    parcel:  analysis.parcel_account_number || '',
    freight: analysis.freight_account_number || '',
  };
  const shipping = computeShipping(customer, totals, methodOverride, poAccounts);
  const effectiveFreight = freightOverride != null ? freightOverride : shipping.freightCharge;
  const effectiveMethod  = methodNameOverride != null ? methodNameOverride : (shipping.shippingMethod || '');
  const effectiveAccount = accountOverride != null ? accountOverride : (shipping.shippingAccount || '');

  // Hide an "excluded" PO line only once that item is actually in the order
  // (matched, or added via "+ Add Item") — matched by item number/alias.
  // We deliberately do NOT hide just because the item is on the price list:
  // an on-list item that the matcher missed must stay visible, not vanish.
  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const knownKeys = new Set();
  lines.forEach(l => { if (l.item_number) knownKeys.add(normKey(l.item_number)); if (l.alias) knownKeys.add(normKey(l.alias)); });
  const visibleExcluded = excluded.filter(e => {
    const id = normKey(e.identifier);
    return !(id && knownKeys.has(id));
  });

  // Recompute a line from either a new case count or a new unit quantity.
  // Cases ⇄ Quantity stay in sync (qty = cases × units/case), and the price
  // tier is re-evaluated against the resulting case count.
  function repriceLine(line, change) {
    const upc = line.unitsPerCase;
    let cases, qty;
    if (change.cases != null) {
      cases = Math.max(0, change.cases);
      qty = upc > 0 ? cases * upc : cases;
    } else {
      qty = Math.max(0, change.qty);
      cases = upc > 0 ? qty / upc : qty;
    }
    cases = Math.round(cases * 100) / 100;
    qty = Math.round(qty * 100) / 100;
    const priced = pricingMap.get(line.item_number);
    const tier = priced ? priceForCases(priced.tiers, cases) : null;
    const unitPrice = tier ? round2(tier.price) : line.unitPrice;
    return {
      ...line,
      cases, qty, unitPrice,
      total: unitPrice != null ? round2(qty * unitPrice) : null,
      tierMinCases: tier ? tier.min_cases : line.tierMinCases,
      missingPrice: unitPrice == null,
    };
  }

  function onCasesChange(idx, val) {
    const cases = parseFloat(val);
    setLines(prev => applyOrderTierPricing(
      prev.map((l, i) => i === idx ? repriceLine(l, { cases: isNaN(cases) ? 0 : cases }) : l),
      pricingMap,
    ));
    setApproved(false);
  }

  function onQtyChange(idx, val) {
    const qty = parseFloat(val);
    setLines(prev => applyOrderTierPricing(
      prev.map((l, i) => i === idx ? repriceLine(l, { qty: isNaN(qty) ? 0 : qty }) : l),
      pricingMap,
    ));
    setApproved(false);
  }

  function onReorder(from, to) {
    setLines(prev => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setApproved(false);
  }

  function onRemove(idx) {
    setLines(prev => applyOrderTierPricing(prev.filter((_, i) => i !== idx), pricingMap));
    setApproved(false);
  }

  function addItemToOrder(itemNumber, qty) {
    setLines(prev => {
      if (prev.some(l => l.item_number === itemNumber)) return prev;
      const [base] = buildOrderLines([{ item_number: itemNumber, ordered_cases: 1 }], pricingMap, itemDetails);
      if (!base) return prev;
      const q = (qty === undefined || qty === null || qty === '')
        ? (base.unitsPerCase || 1)
        : Math.max(0, parseFloat(qty) || 0);
      return applyOrderTierPricing([...prev, repriceLine(base, { qty: q })], pricingMap);
    });
    setApproved(false);
  }

  // Save a brand-new shipping address to the customer's Zoho contact, then
  // add it to the dropdown and select it for this order.
  async function saveNewAddress() {
    if (!customer) return;
    const addr = {
      attention: (newAddr.attention || '').trim(),
      address:   (newAddr.address || '').trim(),
      street2:   (newAddr.street2 || '').trim(),
      city:      (newAddr.city || '').trim(),
      state:     (newAddr.state || '').trim(),
      zip:       (newAddr.zip || '').trim(),
      country:   (newAddr.country || 'USA').trim(),
    };
    if (!addr.address && !addr.city) {
      toast('Enter at least a street and city', 'error');
      return;
    }
    setAddingAddr(true);
    try {
      const res = await addCustomerAddress(customer.id, addr);
      const id = res.address_id || `added-${Date.now()}`;
      const opt = {
        id,
        label: formatAddress(addr),
        addr: { ...addr, address_id: res.address_id || undefined },
        isNew: false,
      };
      setAddresses(prev => [...prev, opt]);
      setSelectedAddrId(id);
      setAddrMatched(null);
      setShowAddAddr(false);
      setNewAddr(emptyAddr);
      setApproved(false);
      toast('Shipping address added to Zoho');
    } catch (e) {
      toast(`Could not add address: ${e.message}`, 'error');
    } finally {
      setAddingAddr(false);
    }
  }

  function openPricingApp() {
    if (!PRICING_APP_URL) {
      toast('Set REACT_APP_PRICING_APP_URL to link the Customer Pricing App', 'error');
      return;
    }
    setShowPricingApp(true);
  }

  // After editing pricing in the Customer Pricing App, refresh the catalog and
  // re-price the existing order lines (keeping their case quantities).
  async function refreshCatalogAndReprice() {
    if (!customer) return;
    try {
      const rows = await fetchCustomerPricing(customer.name);
      const pmap = groupPricing(rows || []);
      const skus = [...pmap.keys()];
      const details = skus.length ? await fetchItemDetailsBySku(skus) : [];
      setPricingMap(pmap);
      setItemDetails(details);
      const { display, levels } = buildCatalogDisplay(pmap, details);
      setCatalog(display);
      setPriceLevels(levels);
      setLines(prev => applyOrderTierPricing(buildOrderLines(
        prev.map(l => ({ item_number: l.item_number, ordered_quantity: l.qty })),
        pmap, details,
      ), pmap));
      setApproved(false);
    } catch (e) {
      toast(`Could not refresh pricing: ${e.message}`, 'error');
    }
  }

  const sendable = lines.filter(l => l.item_id && l.unitPrice != null && l.cases > 0);
  const cannotSend = sendable.length === 0;

  async function handleSend() {
    if (!customer || cannotSend) return;
    setSending(true);
    try {
      const dropped = lines.length - sendable.length;
      const selectedAddr = addresses.find(a => a.id === selectedAddrId);

      const payload = {
        customer_id: customer.id,
        reference_number: poNumber || '',
        line_items: sendable.map(l => ({
          item_id: l.item_id,
          name: l.item_number,
          description: l.description || '',
          quantity: l.qty,
          rate: l.unitPrice,
          unit: l.unit || '',
        })),
        shipping_charge: effectiveFreight,
        delivery_method: effectiveMethod || '',
        comment: `Pallets: ${shipping.pallets}${shipping.palletDimensions ? ` • Pallet Dimensions: ${shipping.palletDimensions.toUpperCase()}` : ''} • Weight: ${shipping.weight} lb • Cases: ${totals.cases}${effectiveAccount ? ` • Acct: ${effectiveAccount}` : ''}`,
      };

      if (selectedAddr?.addr) {
        const a = selectedAddr.addr;
        payload.shipping_address = {
          attention: a.attention || '',
          address:   a.address || a.street || '',
          street2:   a.street2 || '',
          city:      a.city || '',
          state:     a.state || '',
          zip:       a.zip || '',
          country:   a.country || 'USA',
        };
      }

      const res = await createSalesOrder(payload);
      setResult(res);

      const { packing, pallet } = buildDocs({
        customer, shipping, totals, poNumber,
        invoiceNumber: res.salesorder_number || res.salesorder_id || '',
        shipAddr: selectedAddr?.addr || null,
        docLines: sendable,
      });
      setPackingData(packing);
      setPalletData(pallet);

      // If the customer has Remarks, show them first; otherwise go straight to the packing list.
      if (customer.remarks && String(customer.remarks).trim()) {
        setShowRemarks(true);
      } else {
        setShowPacking(true);
      }

      toast(`Sales Order ${res.salesorder_number || ''} created in Zoho`.trim());
      if (dropped > 0) toast(`${dropped} line(s) skipped (missing item or price)`, 'error');

      // Generate the packing list PDF and attach it to the sales order in Zoho.
      if (res.salesorder_id) {
        try {
          const pdfBase64 = buildPackingPdf(packing);
          await attachSalesOrderPdf({
            salesorderId: res.salesorder_id,
            filename: `Packing-List-${packing.invoiceNumber || res.salesorder_id}.pdf`,
            pdfBase64,
          });
          toast('Packing list attached to the sales order');
        } catch (e) {
          toast(`Could not attach packing list: ${e.message}`, 'error');
        }

        // Attach the original uploaded purchase order to the sales order.
        if (poFile && poFile.base64) {
          try {
            const mt = (poFile.mediaType || '').toLowerCase();
            const ext = mt.includes('pdf') ? 'pdf'
              : mt.includes('png') ? 'png'
              : mt.includes('webp') ? 'webp'
              : mt.includes('gif') ? 'gif'
              : mt.match(/jpe?g/) ? 'jpg'
              : mt.includes('html') ? 'html'
              : mt.includes('rfc822') || mt.includes('eml') ? 'eml'
              : mt.includes('text') || mt.includes('octet-stream') ? 'txt'
              : 'pdf';
            await attachSalesOrderFile({
              salesorderId: res.salesorder_id,
              filename: `PO-${packing.invoiceNumber || res.salesorder_id}.${ext}`,
              fileBase64: poFile.base64,
              contentType: poFile.mediaType || 'application/pdf',
            });
            toast('Purchase order attached to the sales order');
          } catch (e) {
            toast(`Could not attach purchase order: ${e.message}`, 'error');
          }
        }

        // Attach the pallet labels PDF (freight only).
        if (pallet) {
          try {
            const palletPdf = await buildPalletLabelsPdf(pallet);
            await attachSalesOrderPdf({
              salesorderId: res.salesorder_id,
              filename: `Pallet-Labels-${pallet.invoiceNumber || res.salesorder_id}.pdf`,
              pdfBase64: palletPdf,
            });
            toast('Pallet labels attached to the sales order');
          } catch (e) {
            toast(`Could not attach pallet labels: ${e.message}`, 'error');
          }
        }
      }
    } catch (e) {
      toast(`Send failed: ${e.message}`, 'error');
    } finally {
      setSending(false);
    }
  }

  if (salesOrderMode) {
    const soNum = soInfo?.number || analysis.sales_order_number || analysis.po_number || '';
    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ padding: '5px 10px' }}>← New order</button>
          <span style={{ color: 'var(--text3)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Sales Order {soNum}</span>
          {fileName && <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {fileName}</span>}
          {loading && <div className="spinner" style={{ marginLeft: 4 }} />}
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="section">
          <div className="section-header">
            <div className="section-title"><span className="section-title-dot" />Sales Order — Packing List &amp; Labels</div>
          </div>
          <div className="section-body">
            {!packingData && !error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', fontSize: 14 }}>
                <div className="spinner" /> Rebuilding documents for Sales Order {soNum}…
              </div>
            )}
            {packingData && (
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>
                <div>Documents ready for <strong>Sales Order {soNum}</strong> — {customer?.name}.</div>
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                  {soInfo?.id
                    ? 'Packing list' + (palletData ? ' and pallet labels were' : ' was') + ' attached to this sales order in Zoho.'
                    : 'Couldn\u2019t locate this sales order in Zoho to attach the files — you can still print below.'}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => setShowPacking(true)}>
                    Open Packing List{palletData ? ' & Labels' : ''}
                  </button>
                  {palletData && (
                    <button className="btn btn-ghost" onClick={() => setShowPallet(true)}>Open Pallet Labels</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {showPacking && packingData && (
          <PackingList
            data={packingData}
            onClose={() => { setShowPacking(false); if (palletData) setShowPallet(true); }}
          />
        )}
        {showPallet && palletData && (
          <PalletLabels data={palletData} onClose={() => setShowPallet(false)} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="section">
        <div className="section-header">
          <div className="section-title"><span className="section-title-dot" />Customer</div>
          {analysis.confidence != null && guessStub && (
            <span className={`badge ${analysis.confidence >= 0.7 ? 'badge-green' : 'badge-gray'}`}>
              {Math.round(analysis.confidence * 100)}% match
            </span>
          )}
        </div>
        <div className="section-body">
          <div className="field-grid-2">
            <div className="field-group">
              <label className="field-label">Detected customer (change if wrong)</label>
              <select className="field-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">— Select a customer —</option>
                {[...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!guessStub && analysis.customer_name && (
                <span style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>
                  Claude read “{analysis.customer_name}” but it isn't in your customer list — please pick manually.
                </span>
              )}
            </div>
            <div className="field-group">
              <label className="field-label">
                Customer PO #
                {poDuplicate && (
                  <span style={{ color: 'var(--danger)', fontWeight: 600, marginLeft: 8 }}>
                    Warning: This is a duplicate purchase order.
                  </span>
                )}
              </label>
              <input
                className="field-input"
                value={poNumber}
                placeholder="PO number"
                onChange={e => { setPoNumber(e.target.value); setApproved(false); }}
              />
            </div>
          </div>

          {customer && (
            <div className="field-group" style={{ marginTop: 12 }}>
              <label className="field-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>
                  Shipping Address
                  {addrMatched === true && <span className="badge badge-green" style={{ marginLeft: 8 }}>matched from PO</span>}
                  {addrMatched === false && <span className="badge badge-blue" style={{ marginLeft: 8 }}>new — added from PO</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddAddr(v => !v)}
                  style={{ flexShrink: 0 }}
                >
                  + Add new Shipping Address
                </button>
              </label>
              <select
                className="field-input"
                value={selectedAddrId}
                onChange={e => setSelectedAddrId(e.target.value)}
              >
                {addresses.length === 0 && <option value="">No addresses on file</option>}
                {addresses.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.isNew ? '➕ New (from PO): ' : ''}{o.label || '(unnamed address)'}
                  </option>
                ))}
              </select>

              {showAddAddr && (
                <div style={{ marginTop: 10, border: '.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, background: 'var(--bg)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>New Shipping Address</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input className="field-input" style={{ gridColumn: '1 / -1' }} placeholder="Attention / Company" value={newAddr.attention} onChange={e => setNewAddr({ ...newAddr, attention: e.target.value })} />
                    <input className="field-input" style={{ gridColumn: '1 / -1' }} placeholder="Street address" value={newAddr.address} onChange={e => setNewAddr({ ...newAddr, address: e.target.value })} />
                    <input className="field-input" style={{ gridColumn: '1 / -1' }} placeholder="Street line 2 (optional)" value={newAddr.street2} onChange={e => setNewAddr({ ...newAddr, street2: e.target.value })} />
                    <input className="field-input" placeholder="City" value={newAddr.city} onChange={e => setNewAddr({ ...newAddr, city: e.target.value })} />
                    <input className="field-input" placeholder="State" value={newAddr.state} onChange={e => setNewAddr({ ...newAddr, state: e.target.value })} />
                    <input className="field-input" placeholder="ZIP" value={newAddr.zip} onChange={e => setNewAddr({ ...newAddr, zip: e.target.value })} />
                    <input className="field-input" placeholder="Country" value={newAddr.country} onChange={e => setNewAddr({ ...newAddr, country: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={addingAddr} onClick={() => { setShowAddAddr(false); setNewAddr(emptyAddr); }}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={addingAddr || (!newAddr.address && !newAddr.city)} onClick={saveNewAddress}>
                      {addingAddr ? 'Saving…' : 'Save to Zoho & use'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '.5px solid rgba(163,45,45,.2)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, marginBottom: '1rem', lineHeight: 1.5 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="loading-state" style={{ padding: '3rem' }}>
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2.5 }} />
          Matching items to {customer?.name || 'customer'} pricing…
        </div>
      )}

      {!loading && customer && (
        <>
          <OrderSummary
            totals={totals}
            shipping={shipping}
            currency={currency}
            methodOverride={methodOverride}
            onMethodChange={setMethodOverride}
            freightValue={effectiveFreight}
            freightCalculated={shipping.freightCharge}
            freightOverridden={freightOverride != null}
            onFreightChange={(v) => setFreightOverride(v)}
            onFreightReset={() => setFreightOverride(null)}
            methodValue={effectiveMethod}
            methodOverridden={methodNameOverride != null}
            onMethodNameChange={(v) => setMethodNameOverride(v)}
            onMethodNameReset={() => setMethodNameOverride(null)}
            accountValue={effectiveAccount}
            accountOverridden={accountOverride != null}
            onAccountChange={(v) => setAccountOverride(v)}
            onAccountReset={() => setAccountOverride(null)}
          />
          <OrderItemsTable
            lines={lines}
            excluded={visibleExcluded}
            currency={currency}
            onCasesChange={onCasesChange}
            onQtyChange={onQtyChange}
            onRemove={onRemove}
            onReorder={onReorder}
            onAddItems={() => setShowPicker(s => !s)}
            addOpen={showPicker}
          />

          {showPicker && (
            <AddItemsTable
              catalog={catalog}
              priceLevels={priceLevels}
              currency={currency}
              existing={new Set(lines.map(l => l.item_number))}
              onAdd={addItemToOrder}
              onClose={() => setShowPicker(false)}
              onModifyPricing={openPricingApp}
            />
          )}

          {/* Approve + send */}
          <div className="section">
            <div className="section-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={approved} disabled={cannotSend || !!result}
                  onChange={e => setApproved(e.target.checked)} />
                I've reviewed this order and approve it
                {cannotSend && <span style={{ color: 'var(--text3)' }}>(no sendable lines)</span>}
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                  Total: <strong style={{ color: 'var(--text)' }}>{money(totals.subtotal + effectiveFreight, currency)}</strong>
                </span>
                {result ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="badge badge-green" style={{ fontSize: 12, padding: '6px 12px' }}>
                      ✓ Sent · SO {result.salesorder_number || result.salesorder_id || ''}
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        window.location.href = result.salesorder_id
                          ? `https://inventory.zoho.com/app#/salesorders/${result.salesorder_id}/edit`
                          : 'https://inventory.zoho.com/app#/salesorders';
                      }}
                    >
                      Go to Zoho
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-primary" disabled={!approved || sending || cannotSend} onClick={handleSend}>
                    {sending ? (<><span className="spinner" style={{ borderTopColor: 'var(--bg)', borderColor: 'rgba(255,255,255,.4)' }} /> Sending…</>) : 'Send to Zoho'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showRemarks && customer && (
        <div className="modal-overlay" onClick={() => { setShowRemarks(false); setShowPacking(true); }}>
          <div className="modal" style={{ maxWidth: 460, padding: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '.5px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Customer Remarks — {customer.name}
            </div>
            <div style={{ padding: '16px 18px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }}>
              {customer.remarks}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '.5px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => { setShowRemarks(false); setShowPacking(true); }}>
                Continue to Packing List
              </button>
            </div>
          </div>
        </div>
      )}

      {showPacking && packingData && (
        <PackingList
          data={packingData}
          onClose={() => { setShowPacking(false); if (palletData) setShowPallet(true); }}
        />
      )}

      {showPallet && palletData && (
        <PalletLabels data={palletData} onClose={() => setShowPallet(false)} />
      )}

      {showPricingApp && PRICING_APP_URL && (
        <PricingAppModal
          url={PRICING_APP_URL}
          customerName={customer?.name}
          onClose={() => { setShowPricingApp(false); refreshCatalogAndReprice(); }}
        />
      )}
    </div>
  );
}
