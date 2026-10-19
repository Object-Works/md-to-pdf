import { NodeType, parse } from 'node-html-parser';

const SKIP = new Set(['script', 'style', 'template', 'head', 'title', 'noscript', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'track', 'svg', 'math', 'button', 'select', 'textarea', 'meta', 'link']);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li',
  'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul', 'body', 'html', 'picture',
]);
const LINK_COLOR = '#0b57d0';

function alignOf(element, inherited) {
  const attr = String(element.getAttribute?.('align') || '').toLowerCase();
  if (['center', 'right', 'left'].includes(attr)) return attr;
  const style = String(element.getAttribute?.('style') || '').match(/text-align\s*:\s*(center|right|left)/i);
  if (style) return style[1].toLowerCase();
  if (element.rawTagName?.toLowerCase() === 'center') return 'center';
  return inherited;
}

export function htmlLength(value) {
  const match = String(value ?? '').trim().match(/^([0-9.]+)\s*(px|%)?$/i);
  if (!match) return undefined;
  return match[2] === '%' ? { percent: Number(match[1]) } : Number(match[1]);
}

function imageItem(element, align) {
  const style = String(element.getAttribute('style') || '');
  const styleWidth = style.match(/(?:^|;)\s*width\s*:\s*([0-9.]+(?:px|%)?)/i)?.[1];
  const styleHeight = style.match(/(?:^|;)\s*height\s*:\s*([0-9.]+(?:px)?)/i)?.[1];
  return {
    type: 'image',
    src: element.getAttribute('src') || element.getAttribute('data-src') || '',
    alt: element.getAttribute('alt') || element.getAttribute('title') || '',
    width: htmlLength(element.getAttribute('width') ?? styleWidth),
    height: htmlLength(element.getAttribute('height') ?? styleHeight),
    align,
  };
}

function tagOf(node) {
  return node.rawTagName ? node.rawTagName.toLowerCase() : '';
}

class Collector {
  constructor() {
    this.items = [];
    this.runs = [];
    this.align = undefined;
  }

  text(text, format) {
    if (!text) return;
    this.runs.push({ ...format, text });
  }

  lineBreak() {
    this.runs.push({ break: true, text: '\n' });
  }

  picture(item, format) {
    this.runs.push({ ...format, picture: item, text: '' });
  }

  flush(extra = {}) {
    const runs = collapse(this.runs);
    this.runs = [];
    const pictures = runs.filter((run) => run.picture);
    if (pictures.length === 1 && runs.every((run) => run.picture || (!run.break && !run.text.trim()))) {
      this.items.push({ ...pictures[0].picture, href: pictures[0].href, align: pictures[0].picture.align ?? this.align });
      return;
    }
    if (runs.some((run) => run.picture || run.break || run.text.trim())) {
      this.items.push({ type: 'text', runs, align: this.align, ...extra });
    }
  }

  push(item) {
    this.flush();
    this.items.push(item);
  }
}

function collapse(runs) {
  const out = [];
  for (const run of runs) {
    if (run.break || run.picture) {
      out.push(run);
      continue;
    }
    const previous = out[out.length - 1];
    const leadingSpace = !previous || previous.break || /\s$/.test(previous.text);
    let text = run.text.replace(/\s+/g, ' ');
    if (leadingSpace) text = text.replace(/^ /, '');
    if (text) out.push({ ...run, text });
  }
  const blank = (run) => !run.break && !run.picture && /^\s*$/.test(run.text);
  while (out.length && blank(out[out.length - 1])) out.pop();
  const last = out[out.length - 1];
  if (last && !last.break && !last.picture) last.text = last.text.replace(/\s+$/, '');
  while (out.length && out[out.length - 1].break) out.pop();
  return out;
}

export const HIGHLIGHT = '#fff3a3';

export function inlineFormat(tag, element, format) {
  if (tag === 'b' || tag === 'strong' || tag === 'th' || tag === 'dt') return { ...format, bold: true };
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var' || tag === 'dfn') return { ...format, italic: true };
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') return { ...format, code: true };
  if (tag === 'a' && element.getAttribute('href')) return { ...format, href: element.getAttribute('href'), color: LINK_COLOR };
  if (tag === 'mark') return { ...format, highlight: HIGHLIGHT };
  if (tag === 's' || tag === 'del' || tag === 'strike') return { ...format, strike: true };
  if (tag === 'u' || tag === 'ins') return { ...format, underline: true };
  if (tag === 'sub' || tag === 'sup') return { ...format, script: tag };
  if (tag === 'small') return { ...format, small: true };
  return format;
}

function cellRuns(element) {
  const collector = new Collector();
  walk(element, collector, { format: {}, inCell: true });
  return { runs: collapse(collector.runs), align: alignOf(element, undefined) };
}

function tableItem(element, align) {
  const rows = [];
  const visit = (node, section) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const tag = tagOf(child);
      if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') visit(child, tag);
      else if (tag === 'tr') {
        const cells = child.childNodes.filter((cell) => ['td', 'th'].includes(tagOf(cell)));
        if (!cells.length) continue;
        const row = cells.map(cellRuns);
        row.header = section === 'thead' || (section !== 'tbody' && rows.length === 0 && cells.every((cell) => tagOf(cell) === 'th'));
        rows.push(row);
      } else if (tag === 'caption') {
        rows.caption = child.text.trim();
      }
    }
  };
  visit(element, '');
  return { type: 'table', rows, caption: rows.caption, align };
}

function listItems(element, collector, state, ordered) {
  collector.flush();
  let number = Number(element.getAttribute('start') || 1);
  for (const child of element.childNodes) {
    if (tagOf(child) !== 'li') continue;
    const inner = new Collector();
    inner.align = state.align;
    walk(child, inner, { ...state, level: (state.level || 0) + 1 });
    inner.flush();
    let marked = false;
    for (const item of inner.items) {
      if (!marked && item.type === 'text' && !item.listLevel) {
        item.marker = ordered ? `${number}.` : '•';
        item.listLevel = (state.level || 0) + 1;
        marked = true;
      } else if (item.type === 'text' && !item.listLevel) {
        item.listLevel = (state.level || 0) + 1;
      }
      collector.items.push(item);
    }
    if (!marked) collector.items.push({ type: 'text', runs: [{ text: ' ' }], marker: ordered ? `${number}.` : '•', listLevel: (state.level || 0) + 1 });
    number += 1;
  }
}

function walk(node, collector, state) {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.COMMENT_NODE) continue;
    if (child.nodeType === NodeType.TEXT_NODE) {
      collector.text(child.text, state.format);
      continue;
    }
    const tag = tagOf(child);
    if (!tag || SKIP.has(tag)) continue;
    if (tag === 'br') {
      collector.lineBreak();
      continue;
    }
    if (tag === 'img') {
      collector.picture(imageItem(child, alignOf(child, state.align)), state.format);
      continue;
    }
    if (tag === 'input' && String(child.getAttribute('type')).toLowerCase() === 'checkbox') {
      collector.text(child.hasAttribute('checked') ? '☑ ' : '☐ ', state.format);
      continue;
    }
    if (state.inCell || !BLOCK.has(tag)) {
      walk(child, collector, { ...state, format: inlineFormat(tag, child, state.format) });
      continue;
    }

    const align = alignOf(child, state.align);
    collector.flush();
    const previousAlign = collector.align;
    collector.align = align;
    const nested = { ...state, align, format: inlineFormat(tag, child, state.format) };

    if (tag === 'hr') {
      collector.push({ type: 'hr' });
    } else if (/^h[1-6]$/.test(tag)) {
      walk(child, collector, { ...nested, format: { ...nested.format, bold: true } });
      collector.flush({ heading: Number(tag.slice(1)) });
    } else if (tag === 'pre') {
      collector.push({ type: 'code', text: child.text.replace(/^\n/, '').replace(/\s+$/, '') });
    } else if (tag === 'table') {
      collector.push(tableItem(child, align));
    } else if (tag === 'ul' || tag === 'ol') {
      listItems(child, collector, nested, tag === 'ol');
    } else if (tag === 'blockquote') {
      const inner = new Collector();
      inner.align = align;
      walk(child, inner, nested);
      inner.flush();
      collector.push({ type: 'quote', items: inner.items });
    } else if (tag === 'summary') {
      collector.text('▶ ', { ...nested.format, bold: true });
      walk(child, collector, { ...nested, format: { ...nested.format, bold: true } });
      collector.flush();
    } else if (tag === 'div' && !child.text.trim() && !child.querySelector('img, hr, br')) {
      const height = String(child.getAttribute('style') || '').match(/height\s*:\s*([0-9.]+)px/i);
      if (height) collector.push({ type: 'spacer', height: Number(height[1]) });
    } else {
      walk(child, collector, nested);
      collector.flush();
    }
    collector.align = previousAlign;
  }
}

export function htmlToItems(html, align) {
  const root = parse(String(html), { comment: false, lowerCaseTagName: false, blockTextElements: { pre: true } });
  const collector = new Collector();
  collector.align = align;
  walk(root, collector, { format: {}, align, level: 0 });
  collector.flush();
  return collector.items;
}

const ALIGN_OPEN = /<(div|p|center|section|figure)\b([^>]*)>/gi;
const ALIGN_CLOSE = /<\/(div|p|center|section|figure)\s*>/gi;

export function alignmentChange(html) {
  const opens = [...String(html).matchAll(ALIGN_OPEN)];
  const closes = [...String(html).matchAll(ALIGN_CLOSE)];
  const depth = opens.length - closes.length;
  if (depth > 0) {
    const last = opens[opens.length - 1];
    const attrs = last[2] || '';
    const align = attrs.match(/align\s*=\s*["']?(center|right|left)/i)?.[1]
      || attrs.match(/text-align\s*:\s*(center|right|left)/i)?.[1]
      || (last[1].toLowerCase() === 'center' ? 'center' : null);
    return { open: depth, align: align ? align.toLowerCase() : null };
  }
  if (depth < 0) return { close: -depth };
  return null;
}

export function inlineHtmlTag(html) {
  const match = String(html).trim().match(/^<(\/)?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(\/)?>$/);
  if (!match) return null;
  const [, closing, name, attrs = ''] = match;
  const attributes = {};
  for (const attr of attrs.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
  }
  return { closing: Boolean(closing), name: name.toLowerCase(), attributes };
}
