import { jsPDF } from 'jspdf';
import { LOGO_SRC } from '../logo';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const DPI = 200;
const F = DPI / 72;       // px per pt
const LW = 432, LH = 288; // 6" x 4" label design space (landscape), in points

// Portrait 4" x 6" pages, one per pallet, with the (unchanged) 6x4 label layout
// rotated 90° so the label prints vertically. Returns base64 (no data: prefix).
export async function buildPalletLabelsPdf(data) {
  const PW = 288, PH = 432; // 4" x 6" portrait, in points
  const doc = new jsPDF({ unit: 'pt', format: [PW, PH], orientation: 'portrait' });
  const count = Math.max(1, Math.round(data.palletCount || 1));
  const logo = await loadImage(LOGO_SRC);

  for (let i = 1; i <= count; i++) {
    if (i > 1) doc.addPage([PW, PH], 'portrait');
    const canvas = renderLabelCanvas(data, i, count, logo);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PW, PH);
  }
  return doc.output('datauristring').split(',')[1];
}

function renderLabelCanvas(data, idx, total, logo) {
  const cw = Math.round(LH * F); // portrait width  (4")
  const ch = Math.round(LW * F); // portrait height (6")
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);

  // Rotate 90° clockwise and scale to point-space, then draw the label normally.
  ctx.translate(cw, 0);
  ctx.rotate(Math.PI / 2);
  ctx.scale(F, F);

  drawLabel(ctx, data, idx, total, logo);
  return canvas;
}

function drawLabel(ctx, data, idx, total, logo) {
  const M = 20;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  // Logo (top-left)
  let logoH = 32, logoW = 120;
  if (logo && logo.width) {
    logoW = logoH * (logo.width / logo.height);
    ctx.drawImage(logo, M, M, logoW, logoH);
  }

  // Address under logo
  ctx.font = '9px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('525 Herriman Court', M, M + logoH + 13);
  ctx.fillText('Noblesville, IN 46060', M, M + logoH + 25);
  ctx.fillText('Phone: (317)773-8915', M, M + logoH + 37);

  // PO # / Invoice # (top-right) — shrink if long
  const headerStrs = [`PO #  ${data.poNumber || ''}`, `Invoice #  ${data.invoiceNumber || ''}`];
  const headerMaxW = LW - M - (M + logoW + 14);
  let hf = 13;
  while (hf > 8) {
    ctx.font = `${hf}px Arial`;
    const widest = Math.max(...headerStrs.map(s => ctx.measureText(s).width));
    if (widest <= headerMaxW) break;
    hf -= 1;
  }
  ctx.font = `${hf}px Arial`;
  ctx.textAlign = 'right';
  ctx.fillText(headerStrs[0], LW - M, M + 11);
  ctx.fillText(headerStrs[1], LW - M, M + 11 + (hf + 5));

  // "Ship To" heading
  ctx.textAlign = 'center';
  ctx.font = '13px Arial';
  ctx.fillText('Ship To', LW / 2, 132);
  const stW = ctx.measureText('Ship To').width;
  ctx.fillRect(LW / 2 - stW / 2, 134, stW, 0.7);

  // Ship-to lines — shrink to fit width and remaining height
  const lines = data.shipToLines || [];
  const contentW = LW - 2 * M;
  const y0 = 156;
  const budgetH = (LH - 30) - y0;
  let st = 17;
  while (st > 9) {
    ctx.font = `${st}px Arial`;
    const widest = lines.reduce((m, l) => Math.max(m, ctx.measureText(String(l)).width), 0);
    const blockH = lines.length * (st * 1.3);
    if (widest <= contentW && blockH <= budgetH) break;
    st -= 1;
  }
  ctx.font = `${st}px Arial`;
  let y = y0;
  const spacing = st * 1.3;
  lines.forEach(line => { ctx.fillText(String(line), LW / 2, y); y += spacing; });

  // Pallet x of N (bottom-right)
  ctx.textAlign = 'right';
  ctx.font = '20px Arial';
  ctx.fillText(`Pallet ${idx} of ${total}`, LW - M, LH - 18);
}
