import { fontNameFor, monoCovers, normalizeText, notoAscent } from './fonts.js';

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
  if ((run.code || style.mono) && monoCovers(ch)) return 'Mono';
  return fontNameFor(ch, bold);
}

function runText(run) {
  if (run.break) return '\n';
  const text = normalizeText(run.text || '');
  return run.code ? text.replace(/\t/g, '    ') : text.replace(/\t/g, ' ');
}

function runSize(run, style) {
  const base = run.code && !style.mono ? style.fontPt * 0.88 : style.fontPt;
  return base * (run.script ? 0.75 : 1) * (run.small ? 0.85 : 1);
}

function runRise(run, style) {
  if (run.script === 'sup') return -0.38 * style.fontPt;
  if (run.script === 'sub') return 0.18 * style.fontPt;
  return 0;
}

const INLINE_IMAGE_FLOOR = 96;

function fittedImage(run, maxWidth) {
  const scale = Math.min(1, maxWidth / run.imageWidth);
  return {
    width: run.imageWidth * scale,
    height: run.imageHeight * scale,
    ascent: (run.imageAscent ?? run.imageHeight) * scale,
  };
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
    if (run.image) {
      commitSegment();
      line += run.imageWidth;
      segment = Math.min(run.imageWidth, INLINE_IMAGE_FLOOR);
      commitSegment();
      prev = '';
      continue;
    }
    const text = runText(run);
    for (const ch of text) {
      if (ch === '\n') {
        commitLine();
        commitSegment();
        prev = '';
        continue;
      }
      const width = stringWidth(doc, ch, fontFor(ch, run, style), runSize(run, style));
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

const MERGED = ['font', 'color', 'code', 'fontSizePt', 'italic', 'strike', 'underline', 'highlight', 'href', 'rise'];

function charsToLine(chars, height, basePt) {
  const textAscent = basePt * notoAscent * PX_PER_PT;
  const line = { runs: [], width: 0, height, baseline: textAscent };
  let below = height - textAscent;
  for (const item of chars) {
    const last = line.runs[line.runs.length - 1];
    if (item.image) {
      line.runs.push({ ...item, text: '' });
      line.baseline = Math.max(line.baseline, item.ascent + 2);
      below = Math.max(below, item.height - item.ascent + 2);
    } else if (last && !last.image && !item.anchor && MERGED.every((key) => last[key] === item[key])) {
      last.text += item.ch;
      last.width += item.width;
    } else {
      const { ch, ...rest } = item;
      line.runs.push({ ...rest, text: ch });
    }
    line.width += item.width;
  }
  line.height = Math.max(height, line.baseline + below);
  return line;
}

export function wrapRuns(doc, runs, maxWidth, style) {
  const height = lineHeightPx(style.fontPt, style.lineHeight);
  const chars = [];
  for (const run of runs || []) {
    if (run.break) {
      chars.push({ newline: true });
      continue;
    }
    if (run.image) {
      chars.push({
        ch: '\ufffc',
        image: run.image,
        href: run.href,
        ...fittedImage(run, maxWidth),
      });
      continue;
    }
    const text = runText(run);
    let first = true;
    for (const ch of text) {
      if (ch === '\n') {
        chars.push({ newline: true });
        continue;
      }
      const fontSizePt = runSize(run, style);
      const font = fontFor(ch, run, style);
      chars.push({
        ch,
        width: stringWidth(doc, ch, font, fontSizePt),
        font,
        fontSizePt,
        color: run.color || style.color || BODY.color,
        code: Boolean(run.code) && !style.mono,
        italic: Boolean(run.italic),
        strike: Boolean(run.strike),
        underline: Boolean(run.underline),
        highlight: run.highlight,
        href: run.href,
        rise: runRise(run, style),
        anchor: first ? run.anchor : undefined,
      });
      first = false;
    }
  }

  const lines = [];
  let current = [];
  let width = 0;
  const commit = () => {
    if (style.mono) {
      lines.push(charsToLine(current, height, style.fontPt));
    } else if (current.some((item) => item.ch !== ' ')) {
      while (current[0]?.ch === ' ') current.shift();
      while (current[current.length - 1]?.ch === ' ') current.pop();
      lines.push(charsToLine(current, height, style.fontPt));
    } else if (lines.length === 0) {
      lines.push(charsToLine([], height, style.fontPt));
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
