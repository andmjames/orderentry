import React, { useState, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { LOGO_SRC } from '../logo';
import { printWithPage } from '../lib/printUtil';

// 6" x 4" label at 96dpi → 576 x 384 px; with 0.25" padding the inner box is 528 x 336 px.
const MAX_LINE_W = 524;   // widest a ship-to line may be before we shrink
const MAX_BLOCK_H = 188;  // vertical room for the ship-to lines

export default function PalletLabels({ data, onClose }) {
  const count = Math.max(1, Math.round(data.palletCount || 1));
  const labels = Array.from({ length: count }, (_, i) => i + 1);
  const shipToLines = data.shipToLines || [];

  // Shrink the ship-to font until the longest line fits the width and the block fits the height.
  const [stSize, setStSize] = useState(20);
  const measRef = useRef(null);
  useLayoutEffect(() => {
    const el = measRef.current;
    if (!el) return;
    let s = 20;
    el.style.fontSize = s + 'px';
    while (s > 9 && (el.scrollWidth > MAX_LINE_W || el.scrollHeight > MAX_BLOCK_H)) {
      s -= 1;
      el.style.fontSize = s + 'px';
    }
    setStSize(s);
  }, [JSON.stringify(shipToLines)]);

  return ReactDOM.createPortal(
    <div className="modal-overlay pallet-overlay" onClick={onClose}>
      {/* hidden measurer */}
      <div
        ref={measRef}
        aria-hidden
        style={{ position: 'absolute', left: -99999, top: 0, whiteSpace: 'nowrap', lineHeight: 1.3, fontFamily: 'Arial, Helvetica, sans-serif', visibility: 'hidden' }}
      >
        {shipToLines.map((l, i) => (<div key={i}>{l}</div>))}
      </div>

      <div
        className="modal"
        style={{ maxWidth: '7in', width: '95vw', maxHeight: '92vh', overflow: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Pallet labels — {count} page{count === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={() => printWithPage('printing-labels', '@page { size: 4in 6in; margin: 0; }')}>Print Pallet Labels</button>
          </div>
        </div>

        <div className="pallet-wrap" style={{ padding: 18, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {labels.map(n => (
            <div key={n} className="pallet-page">
            <div
              className="pallet-label"
              style={{ width: '6in', height: '4in', boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', padding: '0.25in', position: 'relative', border: '1px solid #e5e5e5', overflow: 'hidden' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <img src={LOGO_SRC} alt="PMI Tape" style={{ height: 32 }} />
                  <div style={{ fontSize: 10.5, lineHeight: 1.45, marginTop: 6 }}>
                    525 Herriman Court<br />
                    Noblesville, IN 46060<br />
                    Phone: (317)773-8915
                  </div>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, textAlign: 'right', maxWidth: '2.6in', overflowWrap: 'anywhere' }}>
                  <div>PO #&nbsp;&nbsp;{data.poNumber || ''}</div>
                  <div>Invoice #&nbsp;&nbsp;{data.invoiceNumber || ''}</div>
                </div>
              </div>

              {/* Ship To (auto-fit) */}
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <div style={{ fontSize: 14, textDecoration: 'underline' }}>Ship To</div>
                <div style={{ fontSize: stSize, lineHeight: 1.3, marginTop: 6, whiteSpace: 'nowrap' }}>
                  {shipToLines.map((l, idx) => (<div key={idx}>{l}</div>))}
                </div>
              </div>

              {/* Pallet n of N */}
              <div style={{ position: 'absolute', right: '0.25in', bottom: '0.18in', fontSize: 22 }}>
                Pallet {n} of {count}
              </div>
            </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
