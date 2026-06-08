import React, { useState, useEffect, useCallback } from 'react';
import { fetchCustomer, fetchItemDetailsBySku, matchOrder, createSalesOrder } from '../lib/zoho';
import { fetchCustomerPricing } from '../lib/supabase';
import {
  groupPricing, buildOrderLines, priceForCases,
  computeTotals, computeShipping, num, money,
  pickShippingAddress, formatAddress,
} from '../lib/order';
import OrderSummary from './OrderSummary';
import OrderItemsTable from './OrderItemsTable';
import AddItemsTable from './AddItemsTable';
import PricingAppModal from './PricingAppModal';
import { useToast } from './Toast';

const PRICING_APP_URL = process.env.REACT_APP_PRICING_APP_URL || '';

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

export default function OrderReview({ analysis, fileName, customers, onBack }) {
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
    setMethodOverride(null); setShowPicker(false);
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

  const currency = customer?.currencyCode || 'USD';
  const totals = computeTotals(lines);
  const shipping = computeShipping(customer, totals, methodOverride);

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
      const noteParts = [];
      if (poNumber) noteParts.push(`Customer PO ${poNumber}`);
      noteParts.push(`Ship via ${shipping.shippingMethod} (${shipping.methodType})`);
      if (shipping.shippingAccount) noteParts.push(`Shipping acct ${shipping.shippingAccount}`);
      noteParts.push(`${shipping.pallets} pallet(s), ${shipping.weight} lb, ${totals.cases} cases`);

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
        shipping_charge: shipping.freightCharge,
        notes: noteParts.join(' • '),
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
      toast(`Sales Order ${res.salesorder_number || ''} created in Zoho`.trim());
      if (dropped > 0) toast(`${dropped} line(s) skipped (missing item or price)`, 'error');
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
              <label className="field-label">Customer PO #</label>
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
          />
          <OrderItemsTable
            lines={lines}
            excluded={excluded}
            currency={currency}
            onCasesChange={onCasesChange}
            onQtyChange={onQtyChange}
            onRemove={onRemove}
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
                  Total: <strong style={{ color: 'var(--text)' }}>{money(totals.subtotal + shipping.freightCharge, currency)}</strong>
                </span>
                {result ? (
                  <span className="badge badge-green" style={{ fontSize: 12, padding: '6px 12px' }}>
                    ✓ Sent · SO {result.salesorder_number || result.salesorder_id || ''}
                  </span>
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
