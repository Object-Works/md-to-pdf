import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const { decompress } = require('wawoff2');

const here = path.dirname(fileURLToPath(import.meta.url));

const MONO_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
];

const decoded = new Map();
let loading;
let coverage = { noto: new Set(), symbols: new Set() };

export function notoPath(weight) {
  const root = path.dirname(require.resolve('@fontsource/noto-sans-jp/package.json'));
  return path.join(root, 'files', `noto-sans-jp-japanese-${weight}-normal.woff2`);
}

export function notoFont(weight) {
  if (!decoded.has(weight)) {
    const compressed = readFileSync(notoPath(weight));
    decoded.set(weight, decompress(compressed).then((bytes) => Buffer.from(bytes)));
  }
  return decoded.get(weight);
}

function symbolFont(weight) {
  const file = weight === 700 ? 'MdSymbols-Bold.ttf' : 'MdSymbols-Regular.ttf';
  return readFileSync(path.join(here, 'fonts', file));
}

function codePoints(buffer) {
  const probe = new PDFDocument({ autoFirstPage: false });
  probe.on('data', () => {});
  probe.registerFont('Probe', buffer);
  probe.font('Probe');
  return new Set(probe._font.font.characterSet);
}

export async function prepareFonts() {
  if (!loading) {
    loading = (async () => {
      const regular = await notoFont(400);
      const bold = await notoFont(700);
      const symbols = symbolFont(400);
      const symbolsBold = symbolFont(700);
      coverage = {
        noto: codePoints(regular),
        symbols: codePoints(symbols),
      };
      return { regular, bold, symbols, symbolsBold };
    })();
  }
  return loading;
}

export function fontNameFor(ch, bold) {
  const cp = ch.codePointAt(0);
  if (coverage.noto.has(cp)) return bold ? 'NotoBold' : 'Noto';
  if (coverage.symbols.has(cp)) return bold ? 'SymbolsBold' : 'Symbols';
  return bold ? 'NotoBold' : 'Noto';
}

export async function registerPdfFonts(doc) {
  const fonts = await prepareFonts();
  doc.registerFont('Noto', fonts.regular);
  doc.registerFont('NotoBold', fonts.bold);
  doc.registerFont('Symbols', fonts.symbols);
  doc.registerFont('SymbolsBold', fonts.symbolsBold);
  const mono = MONO_CANDIDATES.find((candidate) => existsSync(candidate));
  doc.registerFont('Mono', mono || fonts.regular);
}
