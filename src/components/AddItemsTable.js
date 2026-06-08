import React, { useState } from 'react';
import { money } from '../lib/order';

function priceLabel(lv, i, levels) {
  const next = levels[i + 1];
  return next ? `${lv}–${next - 1} Cases` : `${lv}+ Cases`;
}

export default function AddItemsTable({ catalog, priceLevels, currency, existing, onAdd, onClose, onModifyPricing }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // item_number currently entering a qty
  const [qtyValue, setQtyValue] = useState('');

  function startAdd(it) {
    setEditing(it.item_number);
    setQtyValue(it.unitsPerCase ? String(it.unitsPerCase) : '');
  }
  function cancelAdd() {
    setEditing(null);
    setQtyValue('');
  }
  function confirmAdd(it) {
    onAdd(it.item_number, qtyValue === '' ? (it.unitsPerCase || 1) : qtyValue);
    setEditing(null);
    setQtyValue('');
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? catalog.filter(it =>
        (it.item_number || '').toLowerCase().includes(q) ||
        (it.alias || '').toLowerCase().includes(q) ||
        (it.description || '').toLowerCase().includes(q))
    : catalog;

  const colCount = 8 + priceLevels.length;

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-title-dot" />
          Customer Pricing
          <span className="badge badge-gray" style={{ marginLeft: 8 }}>{catalog.length} items</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="field-input"
            style={{ width: 220, padding: '6px 10px', fontSize: 13 }}
            placeholder="Search items…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>}
          {onModifyPricing && (
            <button className="btn btn-sm" onClick={onModifyPricing}>Modify Customer Items &amp; Pricing</button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table className="ot-table">
          <thead>
            <tr>
              <th className="ot-th" style={{ minWidth: 100 }}>Item #</th>
              <th className="ot-th" style={{ minWidth: 70 }}>Alias</th>
              <th className="ot-th" style={{ minWidth: 50 }}>UOM</th>
              <th className="ot-th" style={{ minWidth: 280 }}>Description</th>
              <th className="ot-th ot-num">Units/Carton</th>
              {priceLevels.map((lv, i) => (
                <th key={lv} className="ot-th ot-num">{priceLabel(lv, i, priceLevels)}</th>
              ))}
              <th className="ot-th ot-num">Wt/Case (lb)</th>
              <th className="ot-th ot-num">Cartons/Pallet</th>
              <th className="ot-th" style={{ width: 180 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td className="ot-td" colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text3)', padding: '2rem' }}>
                {query ? `No items match “${query}”.` : 'No priced items for this customer.'}
              </td></tr>
            )}
            {filtered.map(it => {
              const added = existing.has(it.item_number);
              return (
                <tr key={it.item_number} className="ot-row">
                  <td className="ot-td ot-item">{it.item_number}</td>
                  <td className="ot-td">{it.alias || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                  <td className="ot-td" style={{ textTransform: 'capitalize' }}>{it.unit || '—'}</td>
                  <td className="ot-td" style={{ color: 'var(--text2)' }}>{it.description || '—'}</td>
                  <td className="ot-td ot-num">{it.unitsPerCase || '—'}</td>
                  {priceLevels.map(lv => (
                    <td key={lv} className="ot-td ot-num">
                      {it.tierByMin[lv] != null
                        ? money(it.tierByMin[lv], currency)
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                  ))}
                  <td className="ot-td ot-num">{it.weightPerCase || '—'}</td>
                  <td className="ot-td ot-num">{it.casesPerPallet || '—'}</td>
                  <td className="ot-td" style={{ textAlign: 'right' }}>
                    {added ? (
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>Added ✓</span>
                    ) : editing === it.item_number ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <input
                          autoFocus
                          className="ot-edit"
                          type="number" min="0" step="any"
                          placeholder="Qty"
                          value={qtyValue}
                          onChange={e => setQtyValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmAdd(it);
                            if (e.key === 'Escape') cancelAdd();
                          }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => confirmAdd(it)}>Done</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => startAdd(it)}>Add to Order</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
