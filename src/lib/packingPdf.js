import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { LOGO_SRC } from '../logo';
import { NAZDAR, IMAGE_TECH } from './nazdar';
import { SIGNATURE_SRC, SIGNATURE_ASPECT } from '../signature';
import { SIGNATURE_MARK_SRC, SIGNATURE_MARK_ASPECT } from '../signatureMark';
import { CUSTOMS_BOX, USMCA, PMI_PARTY, blanketPeriod, todayMDY } from './canada';

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
  totRow('Total Pallets', `${fmt(data.totals.pallets)}${data.palletDimensions ? ` (${data.palletDimensions})` : ''}`);
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

  // Image Technology: boxed "Do Not Stack" cone/label note — Image Technology only.
  if (data.imageTech) {
    const lines = IMAGE_TECH.noteLines;
    const lineH = 15;
    const boxH = lines.length * lineH + 14;
    y += 24;
    if (y + boxH > 762) { doc.addPage(); y = M + 24; }
    doc.setLineWidth(0.8);
    doc.setTextColor(0, 0, 0);
    doc.rect(M, y, right - M, boxH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    let ty = y + 17;
    lines.forEach(ln => { doc.text(ln, pageW / 2, ty, { align: 'center' }); ty += lineH; });
    y += boxH;
  }

  // Canada customs box — orders shipping to Canada.
  if (data.canada) {
    y += 24;
    const innerX = M + 14;
    const cwidth = right - M - 28;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const certifyLines = doc.splitTextToSize(CUSTOMS_BOX.certify, cwidth);
    const estH = 18 + 18 + certifyLines.length * 13 + 16 + 28 + 14 + 12;
    if (y + estH > 762) { doc.addPage(); y = M + 24; }

    const boxTop = y;
    let iy = y + 18;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(CUSTOMS_BOX.doNotRemove, pageW / 2, iy, { align: 'center' });
    iy += 18;
    doc.setFontSize(9.5);
    certifyLines.forEach(ln => { doc.text(ln, pageW / 2, iy, { align: 'center' }); iy += 13; });
    iy += 16;
    doc.setFontSize(11);
    doc.text('Made in the United States of America    ' + fmt(data.totals.cases) + '    Cases', innerX, iy);
    iy += 28;
    doc.text(fmt(data.totals.weight) + '    Lbs Total Weight', innerX, iy);
    try {
      const sw = 84, sh = sw / (SIGNATURE_MARK_ASPECT || (397 / 128));
      // Sit to the right of the weight text, with the image top below the line above.
      doc.addImage(SIGNATURE_MARK_SRC, 'PNG', innerX + 215, iy - sh + 7, sw, sh);
    } catch (e) { /* ignore signature image errors */ }
    iy += 14;
    doc.setLineWidth(0.8);
    doc.rect(M, boxTop, right - M, iy - boxTop);
    y = iy;
  }

  // Nazdar-specific footer: notes, certificates, signature — Nazdar only.
  // Keep the whole block together: if it won't fit on the current page, move it
  // wholesale to a new page (never split the Nazdar note across pages).
  if (data.nazdar) {
    const innerX = M + 12;
    const contentW = right - innerX - 12;

    // Pre-measure the variable-height pieces so we can decide on a page break.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const analysisLines = doc.splitTextToSize(NAZDAR.analysisBody, contentW);

    const sigW = 260;
    const sigH = sigW / (SIGNATURE_ASPECT || (1028 / 288));

    const dnsH = 26;
    const bigBoxH = 259 + analysisLines.length * 7.3 + sigH;
    const blockH = (dnsH + 8) + bigBoxH;
    const pageBottom = 762;
    if (y + 18 + blockH > pageBottom) { doc.addPage(); y = M + 8; } else { y += 18; }

    // ── DO NOT STACK box ──
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
    doc.text(analysisLines, innerX, iy);
    iy += analysisLines.length * 7.3 + 12;

    // Authorized signature image (label + handwritten signature + name/title)
    iy += 10;
    try {
      doc.addImage(SIGNATURE_SRC, 'PNG', innerX, iy, sigW, sigH);
    } catch (e) { /* ignore signature image errors */ }
    iy += sigH + 6;

    // Border around the section.
    doc.setLineWidth(0.8);
    doc.rect(M, boxTop, right - M, iy - boxTop);
  }

  // Canada: append a USMCA Certificate of Origin page.
  if (data.canada) {
    doc.addPage();
    buildUsmcaPage(doc, data);
  }

  return doc.output('datauristring').split(',')[1];
}

// One party cell (label + address lines); returns the bottom y used.
function usmcaPartyCell(doc, x, y, label, lines) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(label, x + 4, y + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  let ty = y + 22;
  (lines || []).forEach(ln => { doc.text(String(ln), x + 4, ty); ty += 9.5; });
  return ty;
}

// Draw a full USMCA Certificate of Origin on the current page.
function buildUsmcaPage(doc, data) {
  const pageW = 612, M = 36, right = 576, width = right - M, mid = M + width / 2;
  const bp = blanketPeriod();
  const today = todayMDY();
  const items = data.usmcaItems || [];

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  let y = M + 6;
  doc.splitTextToSize(USMCA.title1, width).forEach(ln => { doc.text(ln, pageW / 2, y, { align: 'center' }); y += 13; });
  doc.text(USMCA.title2, pageW / 2, y, { align: 'center' }); y += 16;

  const formTop = y;
  doc.setLineWidth(0.6);

  // Row 1: Blanket period | Single shipment
  let rowTop = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('Blanket Period: (MM/DD/YYYY)', M + 4, rowTop + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('From:     ' + bp.from, M + 4, rowTop + 26);
  doc.text('To:          ' + bp.to, M + 4, rowTop + 37);
  doc.text('Single Shipment:    ' + USMCA.singleShipment, mid + 4, rowTop + 11);
  doc.text('Invoice Number:    ' + String(data.invoiceNumber || ''), mid + 4, rowTop + 24);
  let rowBot = rowTop + 46;
  doc.line(M, rowBot, right, rowBot);
  doc.line(mid, rowTop, mid, rowBot);
  y = rowBot;

  // Row 2: Certifier | Exporter
  rowTop = y;
  const b1 = usmcaPartyCell(doc, M, rowTop, "Certifier's Name and Address:", PMI_PARTY);
  const b2 = usmcaPartyCell(doc, mid, rowTop, "Exporter's Name and Address:", PMI_PARTY);
  rowBot = Math.max(b1, b2) + 4;
  doc.line(M, rowBot, right, rowBot);
  doc.line(mid, rowTop, mid, rowBot);
  y = rowBot;

  // Row 3: Producer | Importer
  rowTop = y;
  const b3 = usmcaPartyCell(doc, M, rowTop, "Producer's Name and Address", PMI_PARTY);
  const b4 = usmcaPartyCell(doc, mid, rowTop, "Importer's Name and Address:", data.importerLines || []);
  rowBot = Math.max(b3, b4) + 4;
  doc.line(M, rowBot, right, rowBot);
  doc.line(mid, rowTop, mid, rowBot);
  y = rowBot;

  // Goods table
  const colX = [M, M + width * 0.30, M + width * 0.42, M + width * 0.54, M + width * 0.66, M + width * 0.75, M + width * 0.86, right];
  const headers = ['Part Number/Description of Good(s)', 'Tariff Number', 'Origin Criterion', 'Qualification Method', 'Country of Origin', 'Accumulation Value (USD)', 'Labor Value Content Requirement'];
  const headTop = y;
  const headH = 36;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  for (let i = 0; i < 7; i++) {
    const cx = colX[i], cw = colX[i + 1] - colX[i];
    let hy = headTop + 9;
    doc.splitTextToSize(headers[i], cw - 4).forEach(ln => { doc.text(ln, cx + cw / 2, hy, { align: 'center' }); hy += 7; });
  }
  let ty = headTop + headH;
  doc.line(M, ty, right, ty);

  const rowH = 16;
  const totalRows = Math.max(8, items.length);
  doc.setFont('helvetica', 'normal');
  for (let r = 0; r < totalRows; r++) {
    const it = items[r];
    if (!it) continue;
    const cy = ty + r * rowH + 11;
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(String(it.description || it.item_number || ''), colX[1] - colX[0] - 6), colX[0] + 3, ty + r * rowH + 9);
    doc.setFontSize(7.5);
    doc.text(USMCA.tariff, (colX[1] + colX[2]) / 2, cy, { align: 'center' });
    doc.text(USMCA.originCriterion, (colX[2] + colX[3]) / 2, cy, { align: 'center' });
    doc.text(USMCA.countryOfOrigin, (colX[4] + colX[5]) / 2, cy, { align: 'center' });
    doc.text(USMCA.accumulation, (colX[5] + colX[6]) / 2, cy, { align: 'center' });
    doc.text(USMCA.laborValue, (colX[6] + colX[7]) / 2, cy, { align: 'center' });
  }
  const tableBot = ty + totalRows * rowH;
  for (let i = 0; i < colX.length; i++) doc.line(colX[i], headTop, colX[i], tableBot);
  doc.line(M, tableBot, right, tableBot);
  y = tableBot;

  // Certification statements
  let cy2 = y + 11;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text(USMCA.certifyTitle, M + 4, cy2); cy2 += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  USMCA.certifyText.forEach(t => {
    const lines = doc.splitTextToSize('* ' + t, width - 8);
    doc.text(lines, M + 4, cy2);
    cy2 += lines.length * 7.5 + 1;
  });
  cy2 += 4;
  doc.line(M, cy2, right, cy2);
  y = cy2;

  // Signature | Company
  let sTop = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('AUTHORIZED SIGNATURE:', M + 4, sTop + 13);
  try {
    const sw = 90, sh = sw / (SIGNATURE_MARK_ASPECT || (397 / 128));
    doc.addImage(SIGNATURE_MARK_SRC, 'PNG', M + 140, sTop + 4, sw, sh);
  } catch (e) { /* ignore */ }
  doc.text('COMPANY', mid + 4, sTop + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(USMCA.company, mid + width / 4, sTop + 26, { align: 'center' });
  let sBot = sTop + 38;
  doc.line(M, sBot, right, sBot); doc.line(mid, sTop, mid, sBot);
  y = sBot;

  // Name | Title
  let nTop = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('NAME', M + 4, nTop + 11);
  doc.text('TITLE', mid + 4, nTop + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(USMCA.name, M + 4, nTop + 24);
  doc.text(USMCA.titleField, mid + 4, nTop + 24);
  let nBot = nTop + 30;
  doc.line(M, nBot, right, nBot); doc.line(mid, nTop, mid, nBot);
  y = nBot;

  // Date | Telephone | Fax
  let dTop = y;
  const c2 = M + width * 0.22, c3 = M + width * 0.61;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('DATE', M + 4, dTop + 11);
  doc.text('TELEPHONE', c2 + 4, dTop + 11);
  doc.text('FAX', c3 + 4, dTop + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(today, M + 4, dTop + 24);
  doc.text(USMCA.telephone, c2 + 4, dTop + 24);
  doc.text(USMCA.fax, c3 + 4, dTop + 24);
  let dBot = dTop + 30;
  doc.line(c2, dTop, c2, dBot); doc.line(c3, dTop, c3, dBot);
  y = dBot;

  // Outer border
  doc.setLineWidth(0.8);
  doc.rect(M, formTop, width, y - formTop);
}
