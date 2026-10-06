// Exporta una receta a PDF (A4) con jsPDF, 100% en el navegador.
import { imageSize } from './img.js';

const ONYX = [13, 10, 11], PEACH = [249, 110, 70], BLUE = [153, 178, 221];
// jsPDF (fuentes estándar) solo soporta Latin-1: quitamos emojis y símbolos raros.
const clean = (s) => String(s ?? '').replace(/[^ -ÿ–—‘’“”•…€]/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'receta';

export async function exportRecipePdf(r) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('El generador de PDF aún no ha cargado');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, CW = W - M * 2;
  let y = 24;
  const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };

  // Cabecera
  doc.setFillColor(...ONYX); doc.rect(0, 0, W, 7, 'F');
  doc.setFillColor(...PEACH); doc.rect(0, 7, W, 1.4, 'F');

  // Título
  doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(...ONYX);
  for (const line of doc.splitTextToSize(clean(r.title), CW)) { doc.text(line, M, y); y += 11; }

  // Metadatos
  const meta = [r.time && r.time !== '—' ? r.time : '', r.level ? `Nivel ${r.level}` : '', r.rating ? `Valoración ${r.rating}/5` : '']
    .filter(Boolean).join('   ·   ');
  if (meta) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 105, 108); doc.text(clean(meta), M, y); y += 7; }

  // Tags
  if (r.tags?.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    let x = M;
    for (const t of r.tags) {
      const label = clean(t.charAt(0).toUpperCase() + t.slice(1));
      const w = doc.getTextWidth(label) + 7;
      if (x + w > M + CW) { x = M; y += 8; }
      doc.setFillColor(...BLUE); doc.roundedRect(x, y - 4.4, w, 6.6, 3.3, 3.3, 'F');
      doc.setTextColor(...ONYX); doc.text(label, x + 3.5, y);
      x += w + 2.5;
    }
    y += 11;
  } else { y += 2; }

  // Imagen
  if (r.image) {
    try {
      const { w, h } = await imageSize(r.image);
      const maxH = 85;
      let iw = CW, ih = (h / w) * CW;
      if (ih > maxH) { ih = maxH; iw = (w / h) * maxH; }
      ensure(ih + 6);
      doc.addImage(r.image, 'JPEG', M + (CW - iw) / 2, y, iw, ih);
      y += ih + 8;
    } catch { /* sin imagen */ }
  }

  const heading = (text) => {
    ensure(18);
    doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor(...ONYX);
    doc.text(text, M, y);
    doc.setDrawColor(...PEACH); doc.setLineWidth(0.7); doc.line(M, y + 2, M + 22, y + 2);
    y += 9;
  };

  heading('Ingredientes');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...ONYX);
  for (const ing of r.ingredients || []) {
    const lines = doc.splitTextToSize(clean(ing), CW - 6);
    ensure(lines.length * 5.6 + 1.5);
    doc.setFillColor(...PEACH); doc.circle(M + 1.2, y - 1.3, 0.9, 'F');
    doc.text(lines, M + 6, y);
    y += lines.length * 5.6 + 1.5;
  }

  y += 4;
  heading('Pasos');
  (r.steps || []).forEach((st, i) => {
    const lines = doc.splitTextToSize(clean(st), CW - 10);
    ensure(lines.length * 5.8 + 3);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...PEACH); doc.text(`${i + 1}.`, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...ONYX); doc.text(lines, M + 10, y);
    y += lines.length * 5.8 + 3;
  });

  // Pie de página
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Recetario', M, H - 9); doc.text(`${p} / ${n}`, W - M, H - 9, { align: 'right' });
  }

  const filename = `${slug(r.title)}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  // En móvil: hoja de compartir nativa (guardar en Archivos, WhatsApp, etc.)
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: clean(r.title) }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  doc.save(filename);
}
