// Minimal single/multi-page PDF text generator (Helvetica base fonts, no deps).

function escapePdfText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildContentStream(lines) {
  let ops = [];
  let y = 742;
  const pageTop = 762;
  const pageBottom = 60;
  for (const line of lines) {
    if (y < pageBottom) return null; // out of space
    const font = line.bold ? '/F2' : '/F1';
    const size = String(line.size || 11);
    const txt = `(${escapePdfText(line.text)})`;
    ops.push(`BT ${font} ${size} Tf 50 ${y} Td ${txt} Tj ET`);
    y -= (line.size || 11) + 6;
  }
  return ops.join('\n');
}

function generatePdf(title, subtitle, lines) {
  const perPage = 44;
  const pages = Math.max(1, Math.ceil(lines.length / perPage));
  const objects = {};
  let nextNum = 5;
  const pageNums = [];
  const contents = [];

  for (let p = 0; p < pages; p++) {
    const pageNum = nextNum++;
    const contentNum = nextNum++;
    pageNums.push(pageNum);
    const slice = lines.slice(p * perPage, (p + 1) * perPage);
    const stream = buildContentStream(slice);
    const data = stream || 'BT /F1 11 Tf 50 762 Td () Tj ET';
    contents.push({ objNum: contentNum, data });
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objects[contentNum] = `<< /Length ${data.length} >>\nstream\n${data}\nendstream`;
  }

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  let maxObj = 4;
  for (const n of pageNums) maxObj = Math.max(maxObj, n);
  for (const c of contents) maxObj = Math.max(maxObj, c.objNum);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= maxObj; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i] || ''}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return pdf;
}

function reportLines(title, subtitle, rows) {
  const lines = [];
  lines.push({ text: title, size: 18, bold: true });
  if (subtitle) lines.push({ text: subtitle, size: 11, bold: false });
  lines.push({ text: '', size: 6, bold: false });
  const left = 50; const right = 562;
  for (const r of rows) {
    if (r.b) lines.push({ text: r.text, size: 12, bold: true });
    else lines.push({ text: r.text, size: 11, bold: false });
  }
  return lines;
}

module.exports = { generatePdf, reportLines, buildContentStream };
