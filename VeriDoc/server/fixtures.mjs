import sharp from "sharp";
export const cleanLines = [
  "Full Name: Alex Example",
  "Document Number: DEMO-XX123456",
  "Date of Birth: 2000-01-01",
  "Issue Date: 2024-01-01",
  "Expiry Date: 2030-01-01",
  "Issuer: Example Training Organization",
];
export function imageFixture(lines = cleanLines) {
  const escape = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="850"><rect width="1400" height="850" fill="white"/><g fill="black" font-family="Arial" font-size="35"><text x="60" y="85">FICTIONAL SAMPLE - NOT AN IDENTITY DOCUMENT</text>${lines.map((line, i) => `<text x="60" y="${180 + i * 80}">${escape(line)}</text>`).join("")}</g></svg>`,
    ),
  )
    .png()
    .toBuffer();
}
function buildPDF(objects) {
  const chunks = [Buffer.from("%PDF-1.7\n")],
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(chunks.reduce((n, b) => n + b.length, 0));
    chunks.push(
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(objects[i]) ? objects[i] : Buffer.from(objects[i]),
      Buffer.from("\nendobj\n"),
    );
  }
  const start = chunks.reduce((n, b) => n + b.length, 0);
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${start}\n%%EOF`,
    ),
  );
  return Buffer.concat(chunks);
}
export function textPDF(
  lines = cleanLines,
  { dates = false, blank = false } = {},
) {
  const content = blank
    ? ""
    : `BT /F1 16 Tf 40 760 Td ${["FICTIONAL SAMPLE", ...lines].map((s, i) => `${i ? "0 -40 Td " : ""}(${s.replace(/[()\\]/g, "")}) Tj`).join("\n")} ET`;
  return buildPDF([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 850 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    dates
      ? "<< /Creator (VeriDoc tests) /CreationDate (D:20261027000000Z) /ModDate (D:20250101000000Z) >>"
      : "<< /Creator (VeriDoc tests) >>",
  ]);
}
export async function scannedPDF() {
  const jpeg = await sharp(await imageFixture())
    .jpeg()
    .toBuffer();
  const content = "q 700 0 0 425 0 0 cm /Im0 Do Q";
  return buildPDF([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 425] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1400 /Height 850 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Creator (VeriDoc scanned fixture) >>",
  ]);
}
