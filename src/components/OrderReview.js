import React, { useState, useEffect, useCallback } from 'react';
import { fetchCustomer, fetchItemDetailsBySku, matchOrder, createSalesOrder, checkDuplicatePo, attachSalesOrderPdf, attachSalesOrderFile } from '../lib/zoho';
import { fetchCustomerPricing } from '../lib/supabase';
import { buildPackingPdf } from '../lib/packingPdf';
import { buildPalletLabelsPdf } from '../lib/palletPdf';
import {
  groupPricing, buildOrderLines, priceForCases,
  computeTotals, computeShipping, num, money,
  pickShippingAddress, formatAddress, normalizeCountry,
} from '../lib/order';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approved, setApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) { setCustomer(null); setLines([]); setExcluded([]); return; }
    setLoading(true); setError(null); setResult(null); setApproved(false);
    setMethodOverride(null); setShowPicker(false); setFreightOverride(null);
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
      setLines(built);

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
  }, [analysis]);

  useEffect(() => { load(customerId); }, [customerId, load]);

  // Warn if this PO number already exists for this customer in Zoho (debounced).
  useEffect(() => {
    setPoDuplicate(false);
    if (!customerId || !poNumber.trim()) return;
    let ignore = false;
    const t = setTimeout(() => {
      checkDuplicatePo({ customerId, poNumber: poNumber.trim() })
        .then(res => { if (!ignore) setPoDuplicate(!!res.duplicate); })
        .catch(() => { if (!ignore) setPoDuplicate(false); });
    }, 600);
    return () => { ignore = true; clearTimeout(t); };
  }, [customerId, poNumber]);

  const currency = customer?.currencyCode || 'USD';
  const totals = computeTotals(lines);
  const poAccounts = {
    parcel:  analysis.parcel_account_number || '',
    freight: analysis.freight_account_number || '',
  };
  const shipping = computeShipping(customer, totals, methodOverride, poAccounts);
  const effectiveFreight = freightOverride != null ? freightOverride : shipping.freightCharge;

  // Hide an "excluded" PO line once that item exists on the customer's price
  // list (catalog) or has been added to the order — matched by item number/alias.
  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const knownKeys = new Set();
  catalog.forEach(c => { if (c.item_number) knownKeys.add(normKey(c.item_number)); if (c.alias) knownKeys.add(normKey(c.alias)); });
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
    const unitPrice = tier ? tier.price : line.unitPrice;
    return {
      ...line,
      cases, qty, unitPrice,
      total: unitPrice != null ? qty * unitPrice : null,
      tierMinCases: tier ? tier.min_cases : line.tierMinCases,
      missingPrice: unitPrice == null,
    };
  }

  function onCasesChange(idx, val) {
    const cases = parseFloat(val);
    setLines(prev => prev.map((l, i) => i === idx ? repriceLine(l, { cases: isNaN(cases) ? 0 : cases }) : l));
    setApproved(false);
  }

  function onQtyChange(idx, val) {
    const qty = parseFloat(val);
    setLines(prev => prev.map((l, i) => i === idx ? repriceLine(l, { qty: isNaN(qty) ? 0 : qty }) : l));
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
    setLines(prev => prev.filter((_, i) => i !== idx));
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
      return [...prev, repriceLine(base, { qty: q })];
    });
    setApproved(false);
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
      setLines(prev => buildOrderLines(
        prev.map(l => ({ item_number: l.item_number, ordered_quantity: l.qty })),
        pmap, details,
      ));
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
        delivery_method: shipping.shippingMethod || '',
        comment: `Pallets: ${shipping.pallets} • Weight: ${shipping.weight} lb • Cases: ${totals.cases}`,
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
      const packing = {
        customerName: customer.name,
        shipTo: selectedAddr?.addr ? formatAddress(selectedAddr.addr) : '',
        invoiceNumber: res.salesorder_number || res.salesorder_id || '',
        poNumber,
        totals: { cases: totals.cases, pallets: shipping.pallets, weight: shipping.weight },
        lines: sendable.map(l => ({
          qty: l.qty, unit: l.unit, cases: l.cases,
          item_number: l.item_number, description: l.description,
        })),
        note: /ryonet/i.test(customer.name || '') ? '**Barcodes on all Rolls and Cartons**' : '',
      };
      setPackingData(packing);

      // Pallet labels only when the shipment is going by freight.
      const pallet = (shipping.methodType === 'freight' && shipping.pallets > 0) ? {
        poNumber,
        invoiceNumber: packing.invoiceNumber,
        shipToLines: shipToLines(selectedAddr?.addr, customer.name),
        palletCount: shipping.pallets,
      } : null;
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

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ padding: '5px 10px' }}>← New order</button>
        <span style={{ color: 'var(--text3)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Review order</span>
        {fileName && <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {fileName}</span>}
        {loading && <div className="spinner" style={{ marginLeft: 4 }} />}
      </div>

      {/* Customer selection */}
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
              <label className="field-label">
                Shipping Address
                {addrMatched === true && <span className="badge badge-green" style={{ marginLeft: 8 }}>matched from PO</span>}
                {addrMatched === false && <span className="badge badge-blue" style={{ marginLeft: 8 }}>new — added from PO</span>}
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
                      onClick={() => { window.location.href = 'https://inventory.zoho.com/app#/salesorders'; }}
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
