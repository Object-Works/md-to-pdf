import { fontNameFor } from './fonts.js';

export const PX_PER_PT = 96 / 72;

export const BODY = {
  fontPt: 10.5,
  lineHeight: 1.75,
  color: '#1c1c1c',
};

export const emPx = BODY.fontPt * PX_PER_PT;

const NO_BREAK_AFTER = new Set('「『（【〈《［｛(‘“');
const NO_BREAK_BEFORE = new Set('」』）】〉》］｝)、。，．！？!?・:;：；,.…');

export function pxToPt(px) {
  return (px * 72) / 96;
}

export function lineHeightPx(fontPt, lineHeight) {
  return fontPt * lineHeight * PX_PER_PT;
}

export function stringWidth(doc, text, font, fontSizePt) {
  if (!text) return 0;
  doc.font(font).fontSize(fontSizePt);
  return doc.widthOfString(text) * PX_PER_PT;
}

function isWord(ch) {
  return /[A-Za-z0-9]/.test(ch);
}

function canBreak(prev, next) {
  if (!prev || !next) return true;
  if (NO_BREAK_AFTER.has(prev) || NO_BREAK_BEFORE.has(next)) return false;
  if (isWord(prev) && isWord(next)) return false;
  return true;
}

export function fontFor(ch, run, style) {
  const bold = Boolean(run.bold || style.bold);
  const cp = ch.codePointAt(0);
  const cjk = cp > 0x2e80;
  if ((run.code || style.mono) && !cjk && cp < 0x80) return 'Mono';
  return fontNameFor(ch, bold);
}

export function measureRuns(doc, runs, style) {
  let line = 0;
  let maxLine = 0;
  let segment = 0;
  let maxSegment = 0;
  let prev = '';
  const commitLine = () => {
    maxLine = Math.max(maxLine, line);
    line = 0;
  };
  const commitSegment = () => {
    maxSegment = Math.max(maxSegment, segment);
    segment = 0;
  };
  for (const run of runs || []) {
    const text = run.break ? '\n' : run.text || '';
    for (const ch of text) {
      if (ch === '\n') {
        commitLine();
        commitSegment();
        prev = '';
        continue;
      }
      const fontSizePt = run.code && !style.mono ? style.fontPt * 0.88 : style.fontPt;
      const width = stringWidth(doc, ch, fontFor(ch, run, style), fontSizePt);
      if (prev && canBreak(prev, ch)) commitSegment();
      segment += width;
      line += width;
      prev = ch;
    }
  }
  commitLine();
  commitSegment();
  return { line: maxLine, unbreakable: maxSegment };
}

function charsToLine(chars, height) {
  const line = { runs: [], width: 0, height };
  for (const item of chars) {
    const last = line.runs[line.runs.length - 1];
    if (
      last
      && last.font === item.font
      && last.color === item.color
      && last.code === item.code
      && last.fontSizePt === item.fontSizePt
    ) {
      last.text += item.ch;
      last.width += item.width;
    } else {
      line.runs.push({
        text: item.ch,
        width: item.width,
        font: item.font,
        color: item.color,
        code: item.code,
        fontSizePt: item.fontSizePt,
      });
    }
    line.width += item.width;
  }
  return line;
}

export function wrapRuns(doc, runs, maxWidth, style) {
  const height = lineHeightPx(style.fontPt, style.lineHeight);
  const chars = [];
  for (const run of runs || []) {
    const text = run.break ? '\n' : run.text || '';
    for (const ch of text) {
      if (ch === '\n') {
        chars.push({ newline: true });
        continue;
      }
      const fontSizePt = run.code && !style.mono ? style.fontPt * 0.88 : style.fontPt;
      const font = fontFor(ch, run, style);
      chars.push({
        ch,
        width: stringWidth(doc, ch, font, fontSizePt),
        font,
        fontSizePt,
        color: run.color || style.color || BODY.color,
        code: Boolean(run.code) && !style.mono,
      });
    }
  }

  const lines = [];
  let current = [];
  let width = 0;
  const commit = () => {
    if (style.mono) {
      lines.push(charsToLine(current, height));
    } else if (current.some((item) => item.ch !== ' ')) {
      while (current[0]?.ch === ' ') current.shift();
      while (current[current.length - 1]?.ch === ' ') current.pop();
      lines.push(charsToLine(current, height));
    } else if (lines.length === 0) {
      lines.push(charsToLine([], height));
    }
    current = [];
    width = 0;
  };

  for (const item of chars) {
    if (item.newline) {
      commit();
      continue;
    }
    if (current.length > 0 && width + item.width > maxWidth + 0.5) {
      let breakAt = current.length;
      while (breakAt > 0) {
        const prev = current[breakAt - 1]?.ch;
        const next = current[breakAt]?.ch ?? item.ch;
        if (canBreak(prev, next)) break;
        breakAt -= 1;
      }
      if (breakAt === 0) breakAt = current.length > 1 ? 1 : current.length;
      const overflow = current.splice(breakAt);
      commit();
      current = overflow;
      width = overflow.reduce((sum, part) => sum + part.width, 0);
    }
    current.push(item);
    width += item.width;
  }
  if (current.length || lines.length === 0) commit();
  return lines.filter((line, index) => style.mono || line.runs.length > 0 || index < lines.length);
}
