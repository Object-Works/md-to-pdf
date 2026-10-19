import MarkdownIt from 'markdown-it';
import deflist from 'markdown-it-deflist';
import { full as emoji } from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import texmath from 'markdown-it-texmath';
import { HIGHLIGHT, htmlLength, inlineHtmlTag } from './html.js';

export function skipToClose(tokens, index) {
  const open = tokens[index].type;
  const close = open.replace('_open', '_close');
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].type === open) depth += 1;
    else if (tokens[cursor].type === close) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return tokens.length - 1;
}

export const LINK_COLOR = '#0b57d0';
const COUNTED_TAGS = {
  b: 'bold', strong: 'bold', mark: 'highlight', i: 'italic', em: 'italic', cite: 'italic', var: 'italic', dfn: 'italic',
  code: 'code', kbd: 'code', samp: 'code', tt: 'code', s: 'strike', del: 'strike', strike: 'strike',
  u: 'underline', ins: 'underline', small: 'small',
};
const COUNTED_TOKENS = { strong: 'bold', em: 'italic', s: 'strike', mark: 'highlight' };

export function createParser() {
  return new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(footnote)
    .use(deflist)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(emoji)
    .use(texmath, { delimiters: 'dollars' });
}

export function glyphText(markdown) {
  const extra = [];
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'emoji') extra.push(token.content);
      if (token.children) visit(token.children);
    }
  };
  visit(createParser().parse(markdown, {}));
  const labels = /\[!(note|tip|important|warning|caution)\]/i.test(markdown)
    ? Object.values(ALERTS).map(([label]) => label).join('')
    : '';
  return `${markdown}\n${extra.join('')}↩☐☑⚠${labels}`;
}

export function footnoteNumber(meta) {
  return (meta?.id ?? 0) + 1;
}

function footnoteRefName(meta) {
  const number = footnoteNumber(meta);
  return meta?.subId ? `fnref-${number}-${meta.subId}` : `fnref-${number}`;
}

export function parseInlines(token) {
  const runs = [];
  const count = { bold: 0, italic: 0, code: 0, strike: 0, underline: 0, highlight: 0, small: 0 };
  const scripts = [];
  const links = [];
  const step = (key, open) => {
    count[key] = Math.max(0, count[key] + (open ? 1 : -1));
  };
  const format = () => {
    const href = links[links.length - 1];
    return {
      bold: count.bold > 0,
      italic: count.italic > 0,
      strike: count.strike > 0,
      underline: count.underline > 0,
      highlight: count.highlight > 0 ? HIGHLIGHT : undefined,
      small: count.small > 0,
      script: scripts[scripts.length - 1],
      href,
      color: href ? LINK_COLOR : undefined,
    };
  };
  for (const child of token?.children || []) {
    const type = child.type;
    const base = type.replace(/_(open|close)$/, '');
    if (type === 'html_inline') {
      const tag = inlineHtmlTag(child.content);
      if (!tag) continue;
      if (COUNTED_TAGS[tag.name]) step(COUNTED_TAGS[tag.name], !tag.closing);
      else if (tag.name === 'sub' || tag.name === 'sup') {
        if (tag.closing) scripts.pop();
        else scripts.push(tag.name);
      } else if (tag.name === 'a') {
        if (tag.closing) links.pop();
        else links.push(tag.attributes.href || undefined);
      } else if (tag.name === 'br') runs.push({ break: true, text: '\n' });
      else if (tag.name === 'img' && !tag.closing) {
        runs.push({
          ...format(),
          text: '',
          picture: {
            src: tag.attributes.src || '',
            alt: tag.attributes.alt || '',
            width: htmlLength(tag.attributes.width),
            height: htmlLength(tag.attributes.height),
            align: ['center', 'right', 'left'].includes(tag.attributes.align) ? tag.attributes.align : undefined,
          },
        });
      }
      continue;
    }
    if (COUNTED_TOKENS[base] && type !== base) step(COUNTED_TOKENS[base], type.endsWith('_open'));
    else if (type === 'sup_open' || type === 'sub_open') scripts.push(base);
    else if (type === 'sup_close' || type === 'sub_close') scripts.pop();
    else if (type === 'link_open') links.push(child.attrGet('href') || undefined);
    else if (type === 'link_close') links.pop();
    else if (type === 'code_inline' || (type === 'text' && count.code > 0)) {
      runs.push({ ...format(), text: child.content, code: true });
    } else if (type === 'softbreak') runs.push({ text: ' ', soft: true });
    else if (type === 'hardbreak') runs.push({ break: true, text: '\n' });
    else if (type === 'image') {
      runs.push({ ...format(), text: '', picture: { src: child.attrGet('src') || '', alt: child.content || '' } });
    } else if (type === 'footnote_ref') {
      const number = footnoteNumber(child.meta);
      runs.push({
        text: String(number),
        script: 'sup',
        href: `#fn-${number}`,
        color: LINK_COLOR,
        anchor: footnoteRefName(child.meta),
      });
    } else if (type === 'footnote_anchor') {
      runs.push({ text: ' ↩', href: `#${footnoteRefName(child.meta)}`, color: LINK_COLOR });
    } else if (type === 'math_inline' || type === 'math_inline_double') {
      runs.push({ ...format(), text: '', math: child.content, display: type === 'math_inline_double' });
    } else if (type === 'text' || type === 'emoji') {
      runs.push({ ...format(), text: child.content });
    }
  }
  return runs;
}

const WIDE = /[\u2e80-\u303f\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff01-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

export function joinSoftBreaks(runs) {
  const edge = (index, direction) => {
    for (let cursor = index + direction; cursor >= 0 && cursor < runs.length; cursor += direction) {
      const run = runs[cursor];
      if (run.break || run.picture || run.math != null) return '';
      const chars = [...(run.text || '')];
      if (chars.length) return direction < 0 ? chars[chars.length - 1] : chars[0];
    }
    return '';
  };
  return runs.map((run, index) => (
    run.soft && WIDE.test(edge(index, -1)) && WIDE.test(edge(index, 1)) ? { ...run, text: '' } : run
  ));
}

export const ALERTS = {
  note: ['ⓘ Note', '#0969da'],
  tip: ['💡 Tip', '#1a7f37'],
  important: ['❗ Important', '#8250df'],
  warning: ['⚠ Warning', '#9a6700'],
  caution: ['⛔ Caution', '#d1242f'],
};

export function alertKind(tokens, index) {
  const inline = tokens[index + 2];
  if (tokens[index + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') return null;
  const children = inline.children || [];
  let lead = 0;
  let head = '';
  while (lead < children.length && children[lead].type === 'text') {
    head += children[lead].content;
    lead += 1;
  }
  const match = head.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
  if (!match || (lead < children.length && !['softbreak', 'hardbreak'].includes(children[lead].type))) return null;
  inline.children = children.slice(lead < children.length ? lead + 1 : lead);
  return match[1].toLowerCase();
}

export function taskMarker(tokens, cursor) {
  if (tokens[cursor + 1]?.type !== 'paragraph_open') return null;
  const first = tokens[cursor + 2]?.children?.[0];
  const match = first?.type === 'text' ? first.content.match(/^\[([ xX])\](?:\s+|$)/) : null;
  if (!match) return null;
  first.content = first.content.slice(match[0].length);
  return match[1] === ' ' ? '☐' : '☑';
}
