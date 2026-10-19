const PAPER_MM = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export const DEFAULTS = {
  format: 'A4',
  landscape: false,
  margin: '16mm 16mm 18mm 16mm',
  pageNumbers: true,
  mermaid: true,
  pageBreak: '#',
};

export function parsePageBreak(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number))].sort();
  const text = String(value ?? '').trim();
  if (/^(none|off|false|0)?$/i.test(text)) return [];
  const levels = new Set();
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    let level;
    if (/^#{1,6}$/.test(part)) level = part.length;
    else if (/^h?[1-6]$/i.test(part)) level = Number(part.replace(/^h/i, ''));
    else throw new Error(`改ページの指定が不正です: ${value}（例: "#"、"# ##"、1,2,3、none）`);
    levels.add(level);
  }
  return [...levels].sort();
}

export function normalizeFormat(value) {
  const map = {
    a3: 'A3',
    a4: 'A4',
    a5: 'A5',
    letter: 'Letter',
    legal: 'Legal',
  };
  const format = map[String(value ?? '').trim().toLowerCase()];
  if (!format) {
    throw new Error(`未対応の用紙です: ${value}（A3, A4, A5, Letter, Legal）`);
  }
  return format;
}

export function lengthToPx(value) {
  const match = String(value).trim().match(/^([0-9.]+)\s*(mm|cm|in|px)?$/i);
  if (!match) throw new Error(`長さの指定が不正です: ${value}`);
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`長さの指定が不正です: ${value}`);
  }
  const unit = (match[2] || 'mm').toLowerCase();
  if (unit === 'mm') return (amount * 96) / 25.4;
  if (unit === 'cm') return (amount * 96) / 2.54;
  if (unit === 'in') return amount * 96;
  return amount;
}

export function parseMargin(value) {
  if (value && typeof value === 'object') {
    const { top, right, bottom, left } = value;
    if ([top, right, bottom, left].some((part) => part == null || part === '')) {
      throw new Error('余白は top, right, bottom, left をすべて指定してください');
    }
    return {
      top: String(top),
      right: String(right),
      bottom: String(bottom),
      left: String(left),
    };
  }

  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 4) {
    throw new Error(`余白の指定が不正です: ${value}（例: 16mm、または 16mm 16mm 18mm 16mm）`);
  }
  for (const part of parts) lengthToPx(part);
  const [top, right = top, bottom = top, left = right] = parts;
  if (parts.length === 3) {
    return { top, right, bottom, left: right };
  }
  return { top, right, bottom, left };
}

export function splitFrontMatter(markdown) {
  const text = String(markdown).replace(/^\uFEFF/, '');
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { data: {}, body: text };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: match[2] };
}

export function optionsFromFrontMatter(data = {}) {
  const options = {};
  if (data.title) options.title = String(data.title);
  if (data.format) options.format = normalizeFormat(data.format);
  if (data.margin) options.margin = String(data.margin);
  const pageBreak = data.pageBreak ?? data['page-break'];
  if (pageBreak != null) options.pageBreak = String(pageBreak);
  if (data.landscape != null && String(data.landscape).trim() !== '') {
    options.landscape = /^(1|true|yes)$/i.test(String(data.landscape));
  }
  return options;
}

function defined(options = {}) {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

export function contentBoxPx({ format, landscape = false, margin }) {
  const normalized = normalizeFormat(format);
  const parsed = typeof margin === 'string' || margin == null ? parseMargin(margin ?? DEFAULTS.margin) : parseMargin(margin);
  const [pageWidth, pageHeight] = PAPER_MM[normalized];
  const widthMm = landscape ? pageHeight : pageWidth;
  const heightMm = landscape ? pageWidth : pageHeight;
  return {
    width: lengthToPx(`${widthMm}mm`) - lengthToPx(parsed.left) - lengthToPx(parsed.right),
    height: lengthToPx(`${heightMm}mm`) - lengthToPx(parsed.top) - lengthToPx(parsed.bottom),
  };
}

export function resolveSettings(frontMatterData = {}, explicit = {}) {
  const merged = {
    ...DEFAULTS,
    ...defined(optionsFromFrontMatter(frontMatterData)),
    ...defined(explicit),
  };

  const format = normalizeFormat(merged.format);
  const margin = parseMargin(merged.margin);
  const landscape = Boolean(merged.landscape);
  const box = contentBoxPx({ format, landscape, margin });

  return {
    format,
    landscape,
    margin,
    pageNumbers: Boolean(merged.pageNumbers),
    mermaid: merged.mermaid !== false,
    pageBreak: parsePageBreak(merged.pageBreak),
    title: merged.title ? String(merged.title) : undefined,
    stylesheet: explicit.stylesheet,
    css: explicit.css || '',
    debugHtml: explicit.debugHtml,
    layoutWidth: Math.max(120, Math.floor(box.width) - 8),
    layoutHeight: Math.max(120, Math.floor(box.height) - 28),
  };
}
