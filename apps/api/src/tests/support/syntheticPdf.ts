/** Builds small, valid PDFs for tests: no files, no fixtures to keep in sync. Text uses Helvetica with WinAnsi encoding. */
const WIN_ANSI_EXTRA: Record<string, number> = { '€': 0x80, '’': 0x92 };

function encodeText(text: string): string {
  let out = '';
  for (const char of text) {
    const code = WIN_ANSI_EXTRA[char] ?? char.charCodeAt(0);
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
    else if (code < 0x20 || code > 0x7e) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += char;
  }
  return out;
}

/** One page per entry; an empty array makes a page with no text at all (what a scan looks like). */
export function buildPdf(pages: readonly (readonly string[])[]): Buffer {
  const objects: string[] = [];
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  pages.forEach((lines, index) => {
    const content = lines.length
      ? `BT /F1 12 Tf 14 TL 50 750 Td ${lines.map((line) => `(${encodeText(line)}) Tj T*`).join(' ')} ET`
      : '0.5 g 50 50 400 600 re f';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
