import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import JsBarcode from 'jsbarcode';
import { LOGO_SRC } from '../logo';
import { printWithPage } from '../lib/printUtil';
import { NAZDAR } from '../lib/nazdar';

export default function PackingList({ data, onClose }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && data.invoiceNumber) {
      try {
        JsBarcode(barcodeRef.current, String(data.invoiceNumber), {
          format: 'CODE128',
          displayValue: false,
          height: 32,
          margin: 0,
          width: 1.6,
        });
      } catch (e) { /* ignore barcode render errors */ }
    }
  }, [data.invoiceNumber]);

  const fmtNum = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const cell = { padding: '3px 6px', fontSize: 12, color: '#000' };
  const th = { ...cell, fontWeight: 700, borderBottom: '1.5px solid #000', textAlign: 'left' };

  return ReactDOM.createPortal(
    <div className="modal-overlay packing-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '8.7in', width: '95vw', maxHeight: '92vh', overflow: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar (not printed) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Packing List ready</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={() => printWithPage('printing-packing', '@page { size: letter; margin: 0; }')}>Print Packing List</button>
          </div>
        </div>

        {/* The printable document */}
        <div className="packing-wrap" style={{ padding: 18, background: '#fff', display: 'flex', justifyContent: 'center' }}>
          <div className="packing-list" style={{ width: '7.5in', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: '32%' }}>
                <img src={LOGO_SRC} alt="PMI Tape" style={{ height: 28, marginBottom: 8 }} />
                <div style={{ fontSize: 9.5, lineHeight: 1.5, color: '#000' }}>
                  525 Herriman Court Noblesville, IN 46060<br />
                  Email: customerservice@pmitape.com<br />
                  Phone: (317)773-8915
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 34, fontWeight: 400, letterSpacing: '.5px' }}>Packing List</div>
              </div>
              <div style={{ width: '28%', display: 'flex', justifyContent: 'flex-end' }}>
                <svg ref={barcodeRef} />
              </div>
            </div>

            {/* Bill/Ship + totals */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }}>
              <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                <div><span style={{ color: '#555' }}>Bill To</span>&nbsp;&nbsp;{data.customerName}</div>
                <div><span style={{ color: '#555' }}>Ship To</span>&nbsp;&nbsp;{data.shipTo || '—'}</div>
                <div><span style={{ color: '#555' }}>Invoice #</span>&nbsp;&nbsp;{data.invoiceNumber || '—'}</div>
                <div><span style={{ color: '#555' }}>PO #</span>&nbsp;&nbsp;{data.poNumber || '—'}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.9, textAlign: 'left', minWidth: '2.2in' }}>
                <div><span style={{ color: '#555' }}>Total Cases</span>&nbsp;&nbsp;{fmtNum(data.totals.cases)}</div>
                <div><span style={{ color: '#555' }}>Total Pallets</span>&nbsp;&nbsp;{fmtNum(data.totals.pallets)}</div>
                <div><span style={{ color: '#555' }}>Total Weight</span>&nbsp;&nbsp;{fmtNum(data.totals.weight)} <span style={{ color: '#555' }}>lbs</span></div>
              </div>
            </div>

            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'right', width: 50 }}>Qty</th>
                  <th style={{ ...th, width: 50 }}>U/M</th>
                  <th style={{ ...th, textAlign: 'right', width: 55 }}>Cases</th>
                  <th style={{ ...th, width: 90 }}>Item #</th>
                  <th style={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, textAlign: 'right' }}>{fmtNum(l.qty)}</td>
                    <td style={cell}>{l.unit || ''}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{fmtNum(l.cases)}</td>
                    <td style={cell}>{l.item_number}</td>
                    <td style={cell}>{l.description || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.note && (
              <div style={{ border: '1px solid #000', padding: '14px 12px', textAlign: 'center', fontSize: 16, marginTop: 30 }}>
                {data.note}
              </div>
            )}

            {data.nazdar && (
              <>
                {/* DO NOT STACK note */}
                <div style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', marginTop: 26 }}>
                  <span style={{ color: '#c00', fontWeight: 700, fontSize: 16 }}>*{NAZDAR.doNotStack}*</span>
                </div>

                {/* Barcodes applied + skid/lot lines + certificates + signature */}
                <div style={{ border: '1px solid #000', padding: '12px 14px', marginTop: 10 }}>
                  <div style={{ textAlign: 'center', color: '#c00', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                    {NAZDAR.barcodesTitle}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{NAZDAR.lotNote}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 2.1, whiteSpace: 'pre' }}>
                    {Array.from({ length: NAZDAR.skidRows }).map((_, i) => (
                      <div key={i}>{NAZDAR.skidLine}</div>
                    ))}
                  </div>

                  {/* Certificate of Origin */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>{NAZDAR.originTitle}</div>
                    <div style={{ fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>{NAZDAR.originBody}</div>
                    <div style={{ fontSize: 8, lineHeight: 1.4 }}>{NAZDAR.originLocation}</div>
                  </div>

                  {/* Certificate of Analysis */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>{NAZDAR.analysisTitle}</div>
                    <div style={{ fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>{NAZDAR.analysisIntro}</div>
                    <div style={{ fontSize: 7, lineHeight: 1.45, marginTop: 2, textAlign: 'justify' }}>{NAZDAR.analysisBody}</div>
                  </div>

                  {/* Authorized signature */}
                  <div style={{ marginTop: 18, fontSize: 9 }}>
                    <div>{NAZDAR.signLabel}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
                      <div style={{ borderBottom: '1px solid #000', width: 150, height: 1 }} />
                      <div style={{ lineHeight: 1.3 }}>
                        <div>{NAZDAR.signName}</div>
                        <div>{NAZDAR.signTitle}</div>
                        <div>{NAZDAR.signCompany}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
