import React, { useState } from 'react';
import { money } from '../lib/order';

const CALENDAR_URL = 'https://teamup.com/ks85fyeys7howgnc42';

export default function OrderItemsTable({ lines, excluded, currency, onCasesChange, onQtyChange, onRemove, onReorder, onAddItems, addOpen }) {
  const subtotal = lines.reduce((s, l) => s + (l.total != null ? l.total : 0), 0);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function handleDrop(toIndex) {
    if (dragIndex != null && dragIndex !== toIndex && onReorder) onReorder(dragIndex, toIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-title-dot" />
          Order Items
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {lines.length} item{lines.length === 1 ? '' : 's'}
          </span>
          {onAddItems && (
            <button className="btn btn-sm" onClick={onAddItems}>
              {addOpen ? 'Hide pricing' : '＋ Add Item'}
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="ot-table">
          <thead>
            <tr>
              <th className="ot-th" style={{ width: 24 }} />
              <th className="ot-th ot-num">Qty</th>
              <th className="ot-th">U/M</th>
              <th className="ot-th">Item #</th>
              <th className="ot-th ot-num">Available</th>
              <th className="ot-th ot-num">Rolls/Case</th>
              <th className="ot-th ot-num">Cases</th>
              <th className="ot-th ot-num">Unit Price</th>
              <th className="ot-th ot-num">Total Price</th>
              <th className="ot-th" style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td className="ot-td" colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: '2rem' }}>
                No matched items.
              </td></tr>
            )}
            {lines.map((l, i) => {
              const partialCase = l.unitsPerCase > 0 && Math.abs(l.cases - Math.round(l.cases)) > 0.0001;
              const lowerCases = Math.floor(l.cases);
              const higherCases = Math.ceil(l.cases);
              const unitWord = (n) => {
                const u = (l.unit || 'unit').trim();
                if (n === 1) return u;
                return /s$/i.test(u) ? u : `${u}s`;
              };
              const caseWord = (n) => (n === 1 ? 'Case' : 'Cases');
              const lowerQty = lowerCases * l.unitsPerCase;
              const higherQty = higherCases * l.unitsPerCase;
              // Short if ordered quantity exceeds available (negative availability counts as 0).
              const shortBy = l.availableStock != null ? (l.qty - Math.max(0, l.availableStock)) : 0;
              const isShort = l.availableStock != null && shortBy > 0.0001;
              return (
              <React.Fragment key={l.item_number + i}>
              <tr
                className="ot-row"
                onDragOver={(e) => { e.preventDefault(); if (overIndex !== i) setOverIndex(i); }}
                onDrop={() => handleDrop(i)}
                style={overIndex === i && dragIndex != null && dragIndex !== i ? { boxShadow: 'inset 0 2px 0 var(--text)' } : undefined}
              >
                <td
                  className="ot-td"
                  style={{ textAlign: 'center', cursor: 'grab', color: 'var(--text3)', userSelect: 'none' }}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                  title="Drag to reorder"
                >⠿</td>
                <td className="ot-td ot-num">
                  <input
                    className="ot-edit"
                    type="number" min="0" step="any"
                    value={l.qty}
                    onChange={e => onQtyChange(i, e.target.value)}
                  />
                </td>
                <td className="ot-td" style={{ textTransform: 'capitalize' }}>{l.unit || '—'}</td>
                <td className="ot-td ot-item">
                  {l.item_number}
                  {l.alias && <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}> · {l.alias}</span>}
                  {l.missingPrice && <span className="badge badge-gray" style={{ marginLeft: 6 }}>no price</span>}
                  {l.missingUnits && <span className="badge badge-gray" style={{ marginLeft: 6 }}>no units/case</span>}
                </td>
                <td className="ot-td ot-num" style={l.availableStock != null && l.availableStock < l.qty ? { color: 'var(--danger)', fontWeight: 600 } : { color: 'var(--text2)' }}>
                  {l.availableStock == null ? '—' : Number(l.availableStock).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td className="ot-td ot-num">{l.unitsPerCase || '—'}</td>
                <td className="ot-td ot-num">
                  <input
                    className="ot-edit"
                    type="number" min="0" step="any"
                    value={l.cases}
                    onChange={e => onCasesChange(i, e.target.value)}
                  />
                </td>
                <td className="ot-td ot-num">{l.unitPrice != null ? money(l.unitPrice, currency) : '—'}</td>
                <td className="ot-td ot-num">{l.total != null ? money(l.total, currency) : '—'}</td>
                <td className="ot-td" style={{ textAlign: 'center' }}>
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 7px' }} title="Remove" onClick={() => onRemove(i)}>✕</button>
                </td>
              </tr>
              {partialCase && (
                <tr className="partial-case-row">
                  <td className="ot-td" colSpan={10} style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 13, padding: '5px 10px', borderBottom: '.5px solid var(--border)' }}>
                    {lowerCases < 1 ? (
                      <>⚠ This is not a complete case. Ask the customer if they would like a complete case ({higherCases} {caseWord(higherCases)} = {higherQty.toLocaleString('en-US')} {unitWord(higherQty)}).</>
                    ) : (
                      <>⚠ This is not a complete case. Ask the customer if they would prefer {lowerCases} {caseWord(lowerCases)} ({lowerQty.toLocaleString('en-US')} {unitWord(lowerQty)}) or {higherCases} {caseWord(higherCases)} ({higherQty.toLocaleString('en-US')} {unitWord(higherQty)}).</>
                    )}
                  </td>
                </tr>
              )}
              {isShort && (
                <tr className="short-stock-row">
                  <td className="ot-td" colSpan={10} style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 13, padding: '5px 10px', borderBottom: '.5px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span>⚠ Short {Math.round(shortBy).toLocaleString('en-US')} {unitWord(Math.round(shortBy))}{l.unitsPerCase > 0 ? <> ({(shortBy / l.unitsPerCase).toLocaleString('en-US', { maximumFractionDigits: 2 })} {caseWord(shortBy / l.unitsPerCase === 1 ? 1 : 2)})</> : ''} for this order</span>
                      <button
                        className="btn btn-sm"
                        style={{ borderColor: 'var(--warn)', color: 'var(--warn)', whiteSpace: 'nowrap', flexShrink: 0 }}
                        onClick={() => window.open(CALENDAR_URL, 'pmi-production-calendar', 'width=1100,height=820')}
                      >
                        Schedule this Item
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="ot-foot">
                <td colSpan={8} className="ot-num" style={{ textAlign: 'right' }}>Subtotal</td>
                <td className="ot-num">{money(subtotal, currency)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {excluded && excluded.length > 0 && (
        <div style={{ borderTop: '.5px solid var(--border)', padding: '12px 1.5rem 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Excluded — not on this customer's price list
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {excluded.map((u, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--text2)', display: 'flex', gap: 8, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--warn)' }}>•</span>
                <span>
                  <strong style={{ color: 'var(--text)' }}>{u.identifier || u.description || 'Unknown item'}</strong>
                  {u.description && u.identifier ? ` — ${u.description}` : ''}
                  {u.reason ? <span style={{ color: 'var(--text3)' }}> ({u.reason})</span> : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
