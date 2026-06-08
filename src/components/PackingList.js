import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import JsBarcode from 'jsbarcode';
import { LOGO_SRC } from '../logo';
import { printWithPage } from '../lib/printUtil';
import { NAZDAR, IMAGE_TECH } from '../lib/nazdar';
import { SIGNATURE_SRC } from '../signature';
import { SIGNATURE_MARK_SRC } from '../signatureMark';
import { CUSTOMS_BOX, USMCA, PMI_PARTY, blanketPeriod, todayMDY } from '../lib/canada';

const fmtNum = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ── One packing-list page ──
function PackingDoc({ data }) {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && data.invoiceNumber) {
      try {
        JsBarcode(barcodeRef.current, String(data.invoiceNumber), {
          format: 'CODE128', displayValue: false, height: 32, margin: 0, width: 1.6,
        });
      } catch (e) { /* ignore barcode render errors */ }
    }
  }, [data.invoiceNumber]);

  const cell = { padding: '3px 6px', fontSize: 12, color: '#000' };
  const th = { ...cell, fontWeight: 700, borderBottom: '1.5px solid #000', textAlign: 'left' };

  return (
    <div className="packing-list" style={{ width: '7.5in', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', margin: '0 auto' }}>
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

      {data.imageTech && (
        <div style={{ border: '1px solid #000', padding: '14px 18px', textAlign: 'center', fontSize: 14, lineHeight: 2, marginTop: 30, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          {IMAGE_TECH.noteLines.map((ln, i) => <div key={i}>{ln}</div>)}
        </div>
      )}

      {data.canada && (
        <div className="customs-box" style={{ border: '1px solid #000', padding: '16px 20px', marginTop: 30, fontSize: 13, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{CUSTOMS_BOX.doNotRemove}</div>
          <div style={{ textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>{CUSTOMS_BOX.certify}</div>
          <div style={{ marginTop: 22 }}>
            Made in the United States of America&nbsp;&nbsp;<u>&nbsp;{fmtNum(data.totals.cases)}&nbsp;</u>&nbsp;Cases
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <span><u>&nbsp;{fmtNum(data.totals.weight)}&nbsp;</u>&nbsp;Lbs Total Weight</span>
            <img src={SIGNATURE_MARK_SRC} alt="Signature" style={{ height: 34 }} />
          </div>
        </div>
      )}

      {data.nazdar && (
        <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginTop: 26 }}>
          <div style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center' }}>
            <span style={{ color: '#c00', fontWeight: 700, fontSize: 16 }}>*{NAZDAR.doNotStack}*</span>
          </div>
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
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>{NAZDAR.originTitle}</div>
              <div style={{ fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>{NAZDAR.originBody}</div>
              <div style={{ fontSize: 8, lineHeight: 1.4 }}>{NAZDAR.originLocation}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>{NAZDAR.analysisTitle}</div>
              <div style={{ fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>{NAZDAR.analysisIntro}</div>
              <div style={{ fontSize: 7, lineHeight: 1.45, marginTop: 2, textAlign: 'justify' }}>{NAZDAR.analysisBody}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <img src={SIGNATURE_SRC} alt="Authorized Signature — Andrew James, President, PMI Tape" style={{ width: '3.6in', height: 'auto', display: 'block' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── USMCA Certificate of Origin page (Canada orders) ──
function UsmcaDoc({ data }) {
  const bp = blanketPeriod();
  const today = todayMDY();
  const items = data.usmcaItems || [];
  const bd = '1px solid #000';
  const cellH = { border: bd, padding: '3px 4px', fontSize: 7.5, fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' };
  const cellD = { border: bd, padding: '3px 4px', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' };
  const cellL = { border: bd, padding: '3px 4px', fontSize: 8, textAlign: 'left', verticalAlign: 'middle' };

  const party = (label, lines) => (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 8.5, lineHeight: 1.4, marginTop: 4 }}>
        {lines.map((ln, i) => <div key={i}>{ln}</div>)}
      </div>
    </div>
  );

  const minRows = 8;
  const fillerRows = Math.max(0, minRows - items.length);

  return (
    <div className="usmca-page" style={{ width: '7.5in', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{USMCA.title1}</div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{USMCA.title2}</div>

      <div style={{ border: bd }}>
        {/* Blanket period | Single shipment */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, borderRight: bd, borderBottom: bd, padding: '6px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>Blanket Period: (MM/DD/YYYY)</div>
            <div style={{ fontSize: 9, marginTop: 10 }}>From:&nbsp;&nbsp;&nbsp;&nbsp;{bp.from}</div>
            <div style={{ fontSize: 9 }}>To:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{bp.to}</div>
          </div>
          <div style={{ flex: 1, borderBottom: bd, padding: '6px 8px' }}>
            <div style={{ fontSize: 9 }}>Single Shipment:&nbsp;&nbsp;&nbsp;{USMCA.singleShipment}</div>
            <div style={{ fontSize: 9, marginTop: 4 }}>Invoice Number:&nbsp;&nbsp;&nbsp;{data.invoiceNumber || ''}</div>
          </div>
        </div>
        {/* Certifier | Exporter */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, borderRight: bd, borderBottom: bd, padding: '6px 8px' }}>{party("Certifier's Name and Address:", PMI_PARTY)}</div>
          <div style={{ flex: 1, borderBottom: bd, padding: '6px 8px' }}>{party("Exporter's Name and Address:", PMI_PARTY)}</div>
        </div>
        {/* Producer | Importer */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, borderRight: bd, borderBottom: bd, padding: '6px 8px' }}>{party("Producer's Name and Address", PMI_PARTY)}</div>
          <div style={{ flex: 1, borderBottom: bd, padding: '6px 8px' }}>{party("Importer's Name and Address:", data.importerLines || [])}</div>
        </div>
        {/* Goods table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cellH, width: '30%' }}>Part Number/Description of Good(s)</th>
              <th style={cellH}>Tariff Number</th>
              <th style={cellH}>Origin Criterion</th>
              <th style={cellH}>Qualification Method</th>
              <th style={cellH}>Country of Origin</th>
              <th style={cellH}>Accumulation Value (USD)</th>
              <th style={cellH}>Labor Value Content Requirement</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={cellL}>{it.description || it.item_number}</td>
                <td style={cellD}>{USMCA.tariff}</td>
                <td style={cellD}>{USMCA.originCriterion}</td>
                <td style={cellD}></td>
                <td style={cellD}>{USMCA.countryOfOrigin}</td>
                <td style={cellD}>{USMCA.accumulation}</td>
                <td style={cellD}>{USMCA.laborValue}</td>
              </tr>
            ))}
            {Array.from({ length: fillerRows }).map((_, i) => (
              <tr key={'f' + i}>
                <td style={cellL}>&nbsp;</td>
                <td style={cellD}></td><td style={cellD}></td><td style={cellD}></td>
                <td style={cellD}></td><td style={cellD}></td><td style={cellD}></td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Certification statements */}
        <div style={{ borderTop: bd, padding: '6px 8px' }}>
          <div style={{ fontSize: 8, fontWeight: 700 }}>{USMCA.certifyTitle}</div>
          {USMCA.certifyText.map((t, i) => (
            <div key={i} style={{ fontSize: 7, lineHeight: 1.4, marginTop: 3 }}>* {t}</div>
          ))}
        </div>
        {/* Signature / company */}
        <div style={{ display: 'flex', borderTop: bd }}>
          <div style={{ flex: 1, borderRight: bd, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
            <span style={{ fontSize: 9, fontWeight: 700 }}>AUTHORIZED SIGNATURE:</span>
            <img src={SIGNATURE_MARK_SRC} alt="Signature" style={{ height: 26 }} />
          </div>
          <div style={{ flex: 1, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>COMPANY</div>
            <div style={{ fontSize: 9, textAlign: 'center', marginTop: 6 }}>{USMCA.company}</div>
          </div>
        </div>
        {/* Name / title */}
        <div style={{ display: 'flex', borderTop: bd }}>
          <div style={{ flex: 1, borderRight: bd, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>NAME</div>
            <div style={{ fontSize: 9 }}>{USMCA.name}</div>
          </div>
          <div style={{ flex: 1, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>TITLE</div>
            <div style={{ fontSize: 9 }}>{USMCA.titleField}</div>
          </div>
        </div>
        {/* Date / phone / fax */}
        <div style={{ display: 'flex', borderTop: bd }}>
          <div style={{ width: '22%', borderRight: bd, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>DATE</div>
            <div style={{ fontSize: 9 }}>{today}</div>
          </div>
          <div style={{ flex: 1, borderRight: bd, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>TELEPHONE</div>
            <div style={{ fontSize: 9 }}>{USMCA.telephone}</div>
          </div>
          <div style={{ flex: 1, padding: '4px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>FAX</div>
            <div style={{ fontSize: 9 }}>{USMCA.fax}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PackingList({ data, onClose }) {
  // Canada orders print 3 packing lists + 3 USMCA certificates; others print one packing list.
  const printPages = [];
  const packingCopies = data.canada ? 3 : 1;
  for (let i = 0; i < packingCopies; i++) printPages.push(<PackingDoc data={data} key={'p' + i} />);
  if (data.canada) {
    for (let i = 0; i < 3; i++) printPages.push(<UsmcaDoc data={data} key={'u' + i} />);
  }

  return ReactDOM.createPortal(
    <div className="modal-overlay packing-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '8.7in', width: '95vw', maxHeight: '92vh', overflow: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar (not printed) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Packing List ready
            {data.canada && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text2)' }}>· Canada — prints 3 copies + 3 USMCA certificates</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={() => printWithPage('printing-packing', '@page { size: letter; margin: 0.5in; }')}>
              {data.canada ? 'Print (3 copies + USMCA)' : 'Print Packing List'}
            </button>
          </div>
        </div>

        {/* Screen preview — one packing list (+ one USMCA for Canada). Not printed. */}
        <div className="packing-preview no-print" style={{ padding: 18, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <PackingDoc data={data} />
          {data.canada && <UsmcaDoc data={data} />}
        </div>

        {/* Print output — hidden on screen, revealed by the print stylesheet. */}
        <div className="packing-print">
          {printPages.map((pg, i) => (
            <div className="pl-sheet" key={i}>{pg}</div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
