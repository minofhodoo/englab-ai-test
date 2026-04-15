import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';

const files = [
  'C:\\Users\\hodoo71\\Downloads\\SDA삼육잉글랩BI 매뉴얼\\SDA삼육잉글랩BI 매뉴얼\\samyook_englab_LOGO Guide_최종.pdf',
  'C:\\Users\\hodoo71\\Downloads\\SDA삼육잉글랩BI 매뉴얼\\SDA삼육잉글랩BI 매뉴얼\\samyook_englab_LOGO_0711(확정).pdf',
];

for (const f of files) {
  const name = f.split('\\').pop();
  console.log('\n===', name, '===\n');
  const data = new Uint8Array(readFileSync(f));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    if (text.trim()) console.log(`[Page ${i}]`, text);
  }
}
