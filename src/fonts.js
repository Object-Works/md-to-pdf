import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const { decompress } = require('wawoff2');

const here = path.dirname(fileURLToPath(import.meta.url));

export const MISSING_GLYPH = '〓';

const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8]|\udb40[\udc00-\udfff]|\ud83c[\udffb-\udfff]/g;

const EMOJI_FALLBACK = new Map(Object.entries({
  '✅': '✔', '☑️': '☑', '✔️': '✔', '✖️': '✖', '❌': '✖', '❎': '✖', '⭕': '○', '⛔': '⊘', '🚫': '⊘',
  '❗': '!', '❕': '!', '❓': '?', '❔': '?', '‼️': '‼', '⁉️': '⁉', '⚠️': '⚠',
  '⭐': '★', '🌟': '★', '✨': '✧', '💡': '◎', '📌': '◆', '📍': '◆', '🔴': '●', '🟠': '●', '🟡': '●', '🟢': '●',
  '🔵': '●', '🟣': '●', '⚫': '●', '⚪': '○', '🟥': '■', '🟧': '■', '🟨': '■', '🟩': '■', '🟦': '■', '🟪': '■',
  '⬛': '■', '⬜': '□', '🔺': '▲', '🔻': '▼', '🔶': '◆', '🔷': '◆', '🔸': '◆', '🔹': '◆',
  '➡️': '→', '⬅️': '←', '⬆️': '↑', '⬇️': '↓', '↗️': '↗', '↘️': '↘', '↙️': '↙', '↖️': '↖', '↔️': '↔', '↕️': '↕',
  '🔁': '↻', '🔄': '↻', '🔃': '↻', '▶️': '▶', '◀️': '◀', '⏩': '»', '⏪': '«',
  '👉': '→', '👈': '←', '👆': '↑', '👇': '↓', '👍': '○', '👎': '×', '🙆': '○', '🙅': '×',
  '📝': '✎', '✏️': '✎', '🖊️': '✎', '✉️': '✉', '📧': '✉', '📞': '☎', '☎️': '☎', '⏰': '◷', '⌛': '⧗', '⏳': '⧗',
  '🔒': '[鍵]', '🔓': '[解錠]', '🔑': '[鍵]', '🚧': '[工事中]', '🎉': '[祝]', '🆕': '[NEW]', '🆗': '[OK]', '🆖': '[NG]',
  '❤️': '♥', '♥️': '♥', '♠️': '♠', '♣️': '♣', '♦️': '♦', '☀️': '☀', '☁️': '☁', '☂️': '☂', '❄️': '❄', '⚡': 'ϟ',
  '1️⃣': '①', '2️⃣': '②', '3️⃣': '③', '4️⃣': '④', '5️⃣': '⑤', '6️⃣': '⑥', '7️⃣': '⑦', '8️⃣': '⑧', '9️⃣': '⑨', '🔟': '⑩',
}));
const EMOJI_KEYS = [...EMOJI_FALLBACK.keys()].sort((a, b) => b.length - a.length);
const EMOJI_PATTERN = new RegExp(EMOJI_KEYS.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');

const decoded = new Map();
let loading;
let coverage = { noto: new Set(), symbols: new Set(), mono: new Set() };
const sliceRanges = new Map();
const sliceFonts = new Map();
const sliceFor = new Map();
const emojiFor = new Map();
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
export let notoAscent = 1.16;

export function notoPath(weight) {
  const root = path.dirname(require.resolve('@fontsource/noto-sans-jp/package.json'));
  return path.join(root, 'files', `noto-sans-jp-japanese-${weight}-normal.woff2`);
}

export function notoFont(weight) {
  if (!decoded.has(weight)) decoded.set(weight, decompressWoff2(notoPath(weight)));
  return decoded.get(weight);
}

function bundledFont(file) {
  return readFileSync(path.join(here, 'fonts', file));
}

function probeFont(buffer) {
  const probe = new PDFDocument({ autoFirstPage: false });
  probe.on('data', () => {});
  probe.registerFont('Probe', buffer);
  probe.font('Probe');
  return probe._font;
}

function codePoints(buffer) {
  return new Set(probeFont(buffer).font.characterSet);
}

function fontSlices(family) {
  if (!sliceRanges.has(family)) {
    const root = path.dirname(require.resolve(`@fontsource/${family}/package.json`));
    const css = readFileSync(path.join(root, '400.css'), 'utf8');
    const slices = [];
    const pattern = new RegExp(`files/${family}-([0-9]+)-400-normal\\.woff2[^}]*?unicode-range:\\s*([^;]+);`, 'g');
    for (const match of css.matchAll(pattern)) {
      const ranges = match[2].split(',').map((part) => {
        const [start, end] = part.trim().replace(/^U\+/i, '').split('-').map((hex) => Number.parseInt(hex, 16));
        return [start, end ?? start];
      });
      slices.push({ family, id: match[1], ranges, root });
    }
    sliceRanges.set(family, slices);
  }
  return sliceRanges.get(family);
}

function slicesFor(family, wanted) {
  return fontSlices(family).filter((slice) => slice.ranges.some(([start, end]) => {
    for (const cp of wanted) {
      if (cp >= start && cp <= end) return true;
    }
    return false;
  }));
}

let decompressQueue = Promise.resolve();

function decompressWoff2(file) {
  const result = decompressQueue.then(async () => Buffer.from(await decompress(readFileSync(file))));
  decompressQueue = result.catch(() => {});
  return result;
}

function loadSlice(slice) {
  const key = `${slice.family}-${slice.id}`;
  if (!sliceFonts.has(key)) {
    const file = (weight) => path.join(slice.root, 'files', `${slice.family}-${slice.id}-${weight}-normal.woff2`);
    const emoji = slice.family === 'noto-emoji';
    sliceFonts.set(key, (async () => {
      const regular = await decompressWoff2(file(400));
      const bold = emoji ? regular : await decompressWoff2(file(700));
      const owners = emoji ? emojiFor : sliceFor;
      for (const cp of codePoints(regular)) {
        if (!owners.has(cp)) owners.set(cp, slice.id);
      }
      return { emoji, id: slice.id, regular, bold };
    })());
  }
  return sliceFonts.get(key);
}

export async function prepareGlyphs(text) {
  await prepareFonts();
  const fromCode = (code) => (code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '');
  const plain = String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => fromCode(Number(num)))
    .normalize('NFC');
  const wanted = new Set();
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 || coverage.noto.has(cp) || sliceFor.has(cp)) continue;
    wanted.add(cp);
  }
  if (!wanted.size) return;
  await Promise.all(slicesFor('noto-sans-jp', wanted).map(loadSlice));
  const pictures = new Set();
  for (const cp of wanted) {
    if (emojiFor.has(cp)) continue;
    if (EMOJI_PRESENTATION.test(String.fromCodePoint(cp)) || !(sliceFor.has(cp) || coverage.symbols.has(cp))) pictures.add(cp);
  }
  if (pictures.size) await Promise.all(slicesFor('noto-emoji', pictures).map(loadSlice));
}

export async function prepareFonts() {
  if (!loading) {
    loading = (async () => {
      const regular = await notoFont(400);
      const bold = await notoFont(700);
      const symbols = bundledFont('MdSymbols-Regular.ttf');
      const symbolsBold = bundledFont('MdSymbols-Bold.ttf');
      const mono = bundledFont('MdMono-Regular.ttf');
      const noto = probeFont(regular);
      notoAscent = noto.ascender / 1000;
      coverage = {
        noto: new Set(noto.font.characterSet),
        symbols: codePoints(symbols),
        mono: codePoints(mono),
      };
      return { regular, bold, symbols, symbolsBold, mono };
    })();
  }
  return loading;
}

function drawable(cp) {
  return coverage.noto.has(cp) || sliceFor.has(cp) || coverage.symbols.has(cp) || emojiFor.has(cp);
}

function emojiText(emoji) {
  const bare = emoji.replace(/\ufe0f/g, '');
  if ([...bare].length === 1 && drawable(bare.codePointAt(0))) return bare;
  return EMOJI_FALLBACK.get(emoji);
}

const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function flagText(cluster) {
  const letters = [...cluster].map((ch) => ch.codePointAt(0) - 0x1f1e6);
  if (letters.length !== 2 || letters.some((code) => code < 0 || code > 25)) return null;
  return `[${letters.map((code) => String.fromCharCode(65 + code)).join('')}]`;
}

function normalizeChar(ch) {
  const cp = ch.codePointAt(0);
  if (ch === '\n' || ch === '\t' || drawable(cp)) return ch;
  const compatible = ch.normalize('NFKC');
  if (compatible !== ch && drawableText(compatible)) return compatible;
  const stripped = ch.normalize('NFD').replace(/\p{M}/gu, '');
  if (stripped && stripped !== ch && drawableText(stripped)) return stripped;
  if (/^\p{M}$/u.test(ch)) return '';
  return MISSING_GLYPH;
}

function drawableText(text) {
  for (const ch of text) {
    if (!drawable(ch.codePointAt(0))) return false;
  }
  return true;
}

export function normalizeText(text) {
  if (!text) return text || '';
  const source = String(text)
    .normalize('NFC')
    .replace(EMOJI_PATTERN, emojiText)
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f]/g, ' ');
  let out = '';
  for (const { segment } of graphemes.segment(source)) {
    if (PICTOGRAPHIC.test(segment) && [...segment].length > 1) {
      const flag = flagText(segment);
      const bare = segment.replace(INVISIBLE, '');
      const first = [...segment.split('\u200d')[0].replace(INVISIBLE, '')];
      if (flag) out += flag;
      else if (first.length === 1) out += normalizeChar(first[0]);
      else out += drawableText(bare) && !segment.includes('\u200d') ? bare : MISSING_GLYPH;
      continue;
    }
    for (const ch of segment.replace(INVISIBLE, '').replace(/\u200d/g, '')) out += normalizeChar(ch);
  }
  return out;
}

export function fontNameFor(ch, bold) {
  const cp = ch.codePointAt(0);
  if (coverage.noto.has(cp)) return bold ? 'NotoBold' : 'Noto';
  if (sliceFor.has(cp)) return `${bold ? 'NotoBold' : 'Noto'}-${sliceFor.get(cp)}`;
  if (emojiFor.has(cp) && EMOJI_PRESENTATION.test(ch)) return `Emoji-${emojiFor.get(cp)}`;
  if (coverage.symbols.has(cp)) return bold ? 'SymbolsBold' : 'Symbols';
  if (emojiFor.has(cp)) return `Emoji-${emojiFor.get(cp)}`;
  return bold ? 'NotoBold' : 'Noto';
}

export function monoCovers(ch) {
  return coverage.mono.has(ch.codePointAt(0));
}

export async function registerPdfFonts(doc) {
  const fonts = await prepareFonts();
  doc.registerFont('Noto', fonts.regular);
  doc.registerFont('NotoBold', fonts.bold);
  doc.registerFont('Symbols', fonts.symbols);
  doc.registerFont('SymbolsBold', fonts.symbolsBold);
  doc.registerFont('Mono', fonts.mono);
  for (const pending of sliceFonts.values()) {
    const slice = await pending;
    if (slice.emoji) {
      doc.registerFont(`Emoji-${slice.id}`, slice.regular);
      continue;
    }
    doc.registerFont(`Noto-${slice.id}`, slice.regular);
    doc.registerFont(`NotoBold-${slice.id}`, slice.bold);
  }
}
