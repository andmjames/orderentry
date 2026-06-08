import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { LOGO_SRC } from '../logo';
import { NAZDAR } from './nazdar';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Build the packing list as a Letter-size PDF and return its base64 (no data: prefix).
// Scaled to match the app-rendered packing list (smaller logo/text/barcode).
export function buildPackingPdf(data) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612 x 792 pt
  const pageW = 612;
  const M = 36; // 0.5"
  const right = pageW - M;
  const LH = 14; // line height for the info rows

  // ── Logo ──
  let logoW = 95, logoH = 21;
  try {
    const props = doc.getImageProperties(LOGO_SRC);
    logoH = 21;
    logoW = logoH * (props.width / props.height);
    doc.addImage(LOGO_SRC, 'PNG', M, M, logoW, logoH);
  } catch (e) { /* ignore */ }

  // ── Company address ──
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('525 Herriman Court Noblesville, IN 46060', M, M + logoH + 11);
  doc.text('Email: customerservice@pmitape.com', M, M + logoH + 20);
  doc.text('Phone: (317)773-8915', M, M + logoH + 29);

  // ── Title ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(24);
  doc.text('Packing List', pageW / 2, M + 19, { align: 'center' });

  // ── Barcode (Code 128) top-right — no human-readable text, short bars ──
  if (data.invoiceNumber) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, String(data.invoiceNumber), {
        format: 'CODE128', displayValue: false, height: 64, width: 3.2, margin: 0,
      });
      const targetH = 24;
      const targetW = targetH * (canvas.width / canvas.height);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', right - targetW, M + 2, targetW, targetH);
    } catch (e) { /* ignore barcode errors */ }
  }

  // ── Bill/Ship/Invoice/PO (left) + totals (right) ──
  doc.setFontSize(9);
  const leftX = M + 18;
  let ly = M + logoH + 50;

  const label = (lbl, x, yy) => {
    doc.setTextColor(110, 110, 110);
    doc.text(lbl, x, yy);
    const w = doc.getTextWidth(lbl);
    doc.setTextColor(0, 0, 0);
    return x + w + 7;
  };

  let vx = label('Bill To', leftX, ly);
  doc.text(String(data.customerName || ''), vx, ly);
  ly += LH;

  vx = label('Ship To', leftX, ly);
  const shipLines = doc.splitTextToSize(String(data.shipTo || '—'), right - vx - 150);
  doc.text(shipLines, vx, ly);
  ly += LH * shipLines.length;

  vx = label('Invoice #', leftX, ly);
  doc.text(String(data.invoiceNumber || '—'), vx, ly);
  ly += LH;

  vx = label('PO #', leftX, ly);
  doc.text(String(data.poNumber || '—'), vx, ly);
  ly += LH;

  // Totals on the right
  const totX = 410;
  let ty = M + logoH + 50;
  const totRow = (lbl, val) => {
    const vX = label(lbl, totX, ty);
    doc.text(val, vX, ty);
    ty += LH;
  };
  totRow('Total Cases', fmt(data.totals.cases));
  totRow('Total Pallets', fmt(data.totals.pallets));
  totRow('Total Weight', `${fmt(data.totals.weight)} lbs`);

  // ── Items table ──
  let y = Math.max(ly, ty) + 16;
  const cQty = 70, cUm = 86, cCases = 165, cItem = 182, cDesc = 270;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Qty', cQty, y, { align: 'right' });
  doc.text('U/M', cUm, y);
  doc.text('Cases', cCases, y, { align: 'right' });
  doc.text('Item #', cItem, y);
  doc.text('Description', cDesc, y);
  y += 4;
  doc.setLineWidth(1);
  doc.line(M, y, right, y);
  y += 13;

  doc.setFont('helvetica', 'normal');
  (data.lines || []).forEach(l => {
    if (y > 760) { doc.addPage(); y = M; }
    doc.text(fmt(l.qty), cQty, y, { align: 'right' });
    doc.text(String(l.unit || ''), cUm, y);
    doc.text(fmt(l.cases), cCases, y, { align: 'right' });
    doc.text(String(l.item_number || ''), cItem, y);
    doc.text(doc.splitTextToSize(String(l.description || ''), right - cDesc), cDesc, y);
    y += 13.5;
  });

  // Customer-specific note (e.g. Ryonet barcode note), boxed and centered.
  if (data.note) {
    y += 24;
    if (y > 720) { doc.addPage(); y = M + 24; }
    const boxH = 30;
    doc.setLineWidth(0.8);
    doc.rect(M, y, right - M, boxH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(String(data.note), pageW / 2, y + boxH / 2 + 4, { align: 'center' });
  }

  // Nazdar-specific footer: notes, certificates, signature — Nazdar only.
  if (data.nazdar) {
    const innerX = M + 12;
    const contentW = right - innerX - 12;

    // Keep the whole block together: start a fresh page if it won't fit.
    if (y > 330) { doc.addPage(); y = M + 8; } else { y += 18; }

    // ── DO NOT STACK box ──
    const dnsH = 26;
    doc.setLineWidth(0.8);
    doc.rect(M, y, right - M, dnsH);
    doc.setTextColor(204, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`*${NAZDAR.doNotStack}*`, pageW / 2, y + dnsH / 2 + 4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += dnsH + 8;

    // ── Big box: barcodes applied + skid lines + certificates + signature ──
    const boxTop = y;
    let iy = y + 16;

    doc.setTextColor(204, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(NAZDAR.barcodesTitle, pageW / 2, iy, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    iy += 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(NAZDAR.lotNote, innerX, iy);
    iy += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (let i = 0; i < NAZDAR.skidRows; i++) {
      doc.text(NAZDAR.skidLine, innerX, iy);
      iy += 15;
    }

    const underlinedTitle = (title) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(title, innerX, iy);
      const w = doc.getTextWidth(title);
      doc.setLineWidth(0.5);
      doc.line(innerX, iy + 1.5, innerX + w, iy + 1.5);
      iy += 11;
    };

    // Certificate of Origin
    iy += 8;
    underlinedTitle(NAZDAR.originTitle);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(NAZDAR.originBody, innerX, iy); iy += 9;
    doc.text(NAZDAR.originLocation, innerX, iy); iy += 14;

    // Certificate of Analysis
    underlinedTitle(NAZDAR.analysisTitle);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(NAZDAR.analysisIntro, innerX, iy); iy += 10;
    doc.setFontSize(6);
    const analysisLines = doc.splitTextToSize(NAZDAR.analysisBody, contentW);
    doc.text(analysisLines, innerX, iy);
    iy += analysisLines.length * 7.3 + 12;

    // Authorized signature
    doc.setFontSize(8.5);
    doc.text(NAZDAR.signLabel, innerX, iy);
    iy += 26;
    doc.setLineWidth(0.6);
    doc.line(innerX, iy, innerX + 150, iy);
    doc.text(NAZDAR.signName, innerX + 162, iy - 11);
    doc.text(NAZDAR.signTitle, innerX + 162, iy - 2);
    doc.text(NAZDAR.signCompany, innerX + 162, iy + 7);
    iy += 14;

    // Border around the section.
    doc.setLineWidth(0.8);
    doc.rect(M, boxTop, right - M, iy - boxTop);
  }

  return doc.output('datauristring').split(',')[1];
}
