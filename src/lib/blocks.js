import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram, renderMath } from './diagrams.js';
import { normalizeText } from './fonts.js';
import { highlightRuns } from './highlight.js';
import { alignmentChange, htmlToItems } from './html.js';
import {
  ALERTS, LINK_COLOR, alertKind, createParser, footnoteNumber, joinSoftBreaks, parseInlines, skipToClose, taskMarker,
} from './markdown.js';
import { tableRowBlocks } from './table.js';
import { BODY, blockBox, emPx, wrapRuns } from './text.js';

const HEADING_PT = { 1: 22, 2: 16, 3: 13, 4: 11.5, 5: 11.5, 6: 11.5 };

function loadImage(doc, picture, basedir, width) {
  const file = localPath(picture.src, picture.basedir || basedir);
  if (!file) return null;
  try {
    const opened = doc.openImage(readFileSync(file));
    let drawWidth = opened.width;
    let drawHeight = opened.height;
    const wantWidth = requestedSize(picture.width, width);
    const wantHeight = requestedSize(picture.height, width);
    if (wantWidth && wantHeight) {
      drawWidth = wantWidth;
      drawHeight = wantHeight;
    } else if (wantWidth) {
      drawHeight = (opened.height * wantWidth) / opened.width;
      drawWidth = wantWidth;
    } else if (wantHeight) {
      drawWidth = (opened.width * wantHeight) / opened.height;
      drawHeight = wantHeight;
    }
    return { opened, width: drawWidth, height: drawHeight };
  } catch {
    return null;
  }
}

function placeholderText(picture) {
  const label = picture.alt || (picture.src ? path.basename(picture.src.split(/[?#]/)[0]) : '');
  return label ? `［画像: ${label}］` : '［画像］';
}

async function mathImage(ctx, tex, display) {
  if (!ctx.mermaid) return null;
  try {
    const rendered = await renderMath(tex, { display });
    return { ...rendered, image: ctx.doc.openImage(rendered.png) };
  } catch (error) {
    ctx.warnings.push(`注意: 数式を描画できなかったため、文字のまま出力しました: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function resolveRuns(ctx, runs, width) {
  const out = [];
  for (const run of joinSoftBreaks(runs)) {
    const { picture, math, display, ...rest } = run;
    if (picture) {
      const loaded = loadImage(ctx.doc, picture, ctx.basedir, width);
      if (loaded) {
        out.push({ ...rest, image: loaded.opened, imageWidth: loaded.width, imageHeight: loaded.height });
      } else {
        out.push({ ...rest, text: placeholderText(picture), color: rest.href ? LINK_COLOR : '#5f6368' });
      }
    } else if (math != null) {
      const rendered = await mathImage(ctx, math, display);
      if (rendered) {
        out.push({ ...rest, image: rendered.image, imageWidth: rendered.width, imageHeight: rendered.height, imageAscent: rendered.ascent });
      } else {
        out.push({ ...rest, text: display ? `$$${math}$$` : `$${math}$`, code: true });
      }
    } else {
      out.push(run);
    }
  }
  return out;
}

function lonePicture(runs) {
  const pictures = runs.filter((run) => run.picture);
  if (pictures.length !== 1) return null;
  const others = runs.every((run) => run.picture || (!run.break && run.math == null && !(run.text || '').trim()));
  return others ? { ...pictures[0].picture, href: pictures[0].href } : null;
}

function visibleRuns(runs) {
  return runs.some((run) => run.image || (run.text && run.text.trim()));
}

function plainText(runs) {
  return runs.map((run) => run.text || '').join('').trim();
}

function slugify(text, used) {
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
  const seen = used.get(base) || 0;
  used.set(base, seen + 1);
  return seen ? `${base}-${seen}` : base;
}

function textBlock(doc, runs, width, style, margins, extra = {}) {
  const lines = wrapRuns(doc, runs, Math.max(40, width), style);
  const contentHeight = lines.reduce((sum, line) => sum + line.height, 0);
  const text = lines.map((line) => line.runs.map((run) => run.text).join('')).join(' ').replace(/\s+/g, ' ').trim();
  return {
    type: 'text',
    lines,
    text,
    style,
    ...blockBox(margins.top, margins.bottom, contentHeight),
    ...extra,
  };
}

function headingMargins(level, fontPx) {
  if (level === 1) return { top: 0, bottom: fontPx * 0.73 + 2.5 };
  if (level === 2) return { top: fontPx * 1.35, bottom: fontPx * 0.57 + 1 };
  if (level === 3) return { top: fontPx * 1.15, bottom: fontPx * 0.35 };
  return { top: fontPx, bottom: fontPx * 0.3 };
}

function localPath(src, basedir) {
  if (!src) return null;
  if (src.startsWith('file:')) return fileURLToPath(src);
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return null;
  if (!basedir) return null;
  return path.resolve(basedir, src);
}

function requestedSize(value, width) {
  if (value == null) return undefined;
  if (typeof value === 'object') return (width * value.percent) / 100;
  return value > 0 ? value : undefined;
}

function pictureBlock(image, naturalWidth, naturalHeight, width, margins, extra = {}) {
  const scale = Math.min(1, width / naturalWidth);
  const drawHeight = naturalHeight * scale;
  return {
    type: 'image',
    image,
    drawWidth: naturalWidth * scale,
    drawHeight,
    ...extra,
    ...blockBox(margins.top, margins.bottom, drawHeight),
  };
}

function imageBlock(doc, image, width) {
  const margins = { top: 0.4 * emPx, bottom: 0.8 * emPx };
  const loaded = loadImage(doc, image, image.basedir, width);
  if (!loaded) {
    return textBlock(doc, [{ text: placeholderText(image), color: image.href ? LINK_COLOR : '#5f6368', href: image.href }], width, BODY, margins, {
      align: image.align,
    });
  }
  return pictureBlock(loaded.opened, loaded.width, loaded.height, width, margins, { align: image.align, href: image.href });
}

async function mathBlock(ctx, tex, width) {
  const rendered = await mathImage(ctx, tex, true);
  if (!rendered) return codeBlocks(ctx.doc, tex.trim(), 'latex', width, ctx.pageHeight);
  return [pictureBlock(rendered.image, rendered.width, rendered.height, width, { top: 0.5 * emPx, bottom: 0.9 * emPx }, { align: 'center' })];
}

async function diagramBlock(doc, source, width, pageHeight, index, reserve = 0) {
  const margins = { top: 0.55 * emPx, bottom: emPx };
  const fullH = pageHeight - margins.top - margins.bottom;
  const availH = Math.max(40, reserve > 0 && fullH - reserve >= fullH * 0.6 ? fullH - reserve : fullH);
  const rendered = await renderDiagram(source, { width, height: availH });
  const scale = Math.min(1, width / rendered.width, availH / rendered.height);
  const drawWidth = rendered.width * scale;
  const drawHeight = rendered.height * scale;
  return {
    block: {
      type: 'diagram',
      image: doc.openImage(rendered.png),
      drawWidth,
      drawHeight,
      scale,
      index,
      ...blockBox(margins.top, margins.bottom, drawHeight),
    },
    warning: scale < 0.7
      ? `注意: 図${index} をページ内に収めるため ${Math.round(scale * 100)}% に縮小しました。読みにくい場合は --format A3 または --landscape を試してください。`
      : null,
  };
}

function codeBlocks(doc, text, lang, width, pageHeight) {
  const style = { fontPt: 8.5, lineHeight: 1.5, color: '#24292f', mono: true };
  const padX = 0.85 * emPx;
  const padY = 0.7 * emPx;
  const lines = wrapRuns(doc, highlightRuns(text.replace(/\n$/, ''), lang), Math.max(40, width - padX * 2), style);
  const marginTop = 0.7 * emPx;
  const marginBottom = emPx;
  const budget = pageHeight - marginTop - marginBottom - padY * 2;
  const groups = [];
  let group = [];
  let height = 0;
  for (const line of lines) {
    if (group.length && height + line.height > budget) {
      groups.push(group);
      group = [];
      height = 0;
    }
    group.push(line);
    height += line.height;
  }
  if (group.length || groups.length === 0) groups.push(group);
  return groups.map((chunk, index) => {
    const contentHeight = chunk.reduce((sum, line) => sum + line.height, 0) + padY * 2;
    return {
      type: 'code',
      lines: chunk,
      padX,
      padY,
      ...blockBox(index === 0 ? marginTop : 0.35 * emPx, index === groups.length - 1 ? marginBottom : 0.35 * emPx, contentHeight),
    };
  });
}

function currentAlign(ctx) {
  return ctx.alignStack?.[ctx.alignStack.length - 1] || undefined;
}

function headingBlock(doc, runs, level, width, align) {
  const fontPt = HEADING_PT[level] || 11.5;
  const fontPx = fontPt * (96 / 72);
  return textBlock(doc, runs, width, {
    fontPt,
    lineHeight: 1.4,
    bold: true,
    color: '#1c1c1c',
  }, headingMargins(level, fontPx), { role: 'heading', level, border: level <= 2, align });
}

async function resolveRows(ctx, rows, width) {
  for (const row of rows) {
    for (const cell of row) cell.runs = await resolveRuns(ctx, cell.runs, width);
  }
  return rows;
}

function paragraphBlock(ctx, runs, width, align, extra = {}) {
  return textBlock(ctx.doc, runs, width, {
    ...BODY,
    fontPt: ctx.small ? 9 : BODY.fontPt,
    color: BODY.color,
  }, ctx.compact
    ? { top: 0.15 * emPx, bottom: 0.2 * emPx }
    : { top: 0.35 * emPx, bottom: 0.7 * emPx }, { align, ...extra });
}

async function htmlBlocks(ctx, items, width) {
  const blocks = [];
  const markerWidth = 1.45 * emPx;
  for (const item of items) {
    if (item.type === 'text') {
      const runs = await resolveRuns(ctx, item.runs, width);
      if (item.heading) {
        const block = headingBlock(ctx.doc, runs, item.heading, width, item.align);
        block.anchor = slugify(plainText(runs), ctx.slugs);
        blocks.push(block);
      } else if (item.listLevel) {
        const level = ctx.level + item.listLevel - 1;
        const block = paragraphBlock({ ...ctx, compact: true }, runs, Math.max(40, width - markerWidth * (level + 1)), item.align);
        block.listed = true;
        block.indent = level * markerWidth;
        block.markerWidth = markerWidth;
        if (item.marker) block.marker = item.marker;
        blocks.push(block);
      } else {
        blocks.push(paragraphBlock(ctx, runs, width, item.align));
      }
    } else if (item.type === 'image') {
      blocks.push(imageBlock(ctx.doc, { ...item, basedir: ctx.basedir }, width));
    } else if (item.type === 'hr') {
      blocks.push({ type: 'hr', ...blockBox(1.3 * emPx, 1.3 * emPx, 1) });
    } else if (item.type === 'spacer') {
      blocks.push({ type: 'spacer', ...blockBox(0, 0, item.height) });
    } else if (item.type === 'code') {
      blocks.push(...codeBlocks(ctx.doc, item.text, '', width, ctx.pageHeight));
    } else if (item.type === 'table' && item.rows.length) {
      if (item.caption) blocks.push(paragraphBlock(ctx, [{ text: item.caption, bold: true }], width, 'center'));
      blocks.push(...tableRowBlocks(ctx.doc, await resolveRows(ctx, item.rows, width), width));
    } else if (item.type === 'quote') {
      const inner = await htmlBlocks({ ...ctx, compact: true }, item.items, Math.max(40, width - 14));
      const contentHeight = inner.reduce((sum, block) => sum + block.height, 0);
      const marginTop = 0.8 * emPx;
      const marginBottom = emPx;
      if (inner.length && marginTop + marginBottom + contentHeight <= ctx.pageHeight) {
        blocks.push({ type: 'quote', children: inner, ...blockBox(marginTop, marginBottom, contentHeight) });
      } else {
        blocks.push(...inner);
      }
    }
  }
  return blocks;
}

async function parseRange(tokens, start, end, ctx, width) {
  const blocks = [];
  let index = start;
  while (index < end) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const runs = await resolveRuns(ctx, parseInlines(tokens[index + 1]), width);
      const block = headingBlock(ctx.doc, runs, level, width, currentAlign(ctx));
      block.anchor = slugify(plainText(runs), ctx.slugs);
      blocks.push(block);
      index += 3;
      continue;
    }
    if (token.type === 'paragraph_open') {
      const parsed = parseInlines(tokens[index + 1]);
      while (tokens[index + 2]?.type === 'footnote_anchor') {
        parsed.push(...parseInlines({ children: [tokens[index + 2]] }));
        index += 1;
      }
      const picture = lonePicture(parsed);
      if (picture) {
        blocks.push(imageBlock(ctx.doc, { align: currentAlign(ctx), ...picture, basedir: ctx.basedir }, width));
      } else {
        const runs = await resolveRuns(ctx, parsed, width);
        if (visibleRuns(runs)) blocks.push(paragraphBlock(ctx, runs, width, currentAlign(ctx)));
      }
      index += 3;
      continue;
    }
    if (token.type === 'math_block' || token.type === 'math_block_eqno') {
      blocks.push(...await mathBlock(ctx, token.content, width));
      index += 1;
      continue;
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      const lang = token.type === 'fence' ? (token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '') : '';
      const source = token.content.replace(/\n$/, '');
      if (ctx.mermaid && (lang === 'mermaid' || lang === 'mmd')) {
        ctx.diagramIndex += 1;
        const current = ctx.diagramIndex;
        let reserve = 0;
        for (let back = blocks.length - 1; back >= 0 && blocks[back].role === 'heading'; back -= 1) {
          reserve += blocks[back].height;
        }
        try {
          const rendered = await diagramBlock(ctx.doc, normalizeText(source.trim()), width, ctx.pageHeight, current, reserve);
          blocks.push(rendered.block);
          if (rendered.warning) ctx.warnings.push(rendered.warning);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const preview = source.trim().split('\n')[0]?.slice(0, 40) || '';
          ctx.warnings.push(`注意: 図${current}（${preview}）を描画できなかったため、コードのまま出力しました: ${message}`);
          blocks.push(paragraphBlock(ctx, [{ text: `⚠ Mermaid 図${current} を描画できませんでした: ${message}`, color: '#d1242f' }], width));
          blocks.push(...codeBlocks(ctx.doc, source, '', width, ctx.pageHeight));
        }
      } else {
        blocks.push(...codeBlocks(ctx.doc, source, lang, width, ctx.pageHeight));
      }
      index += 1;
      continue;
    }
    if (token.type === 'html_block' || token.type === 'html_inline') {
      blocks.push(...await htmlBlocks(ctx, htmlToItems(token.content, currentAlign(ctx)), width));
      const change = alignmentChange(token.content);
      if (change?.open) {
        for (let step = 0; step < change.open; step += 1) ctx.alignStack.push(change.align || currentAlign(ctx));
      } else if (change?.close) {
        ctx.alignStack.splice(Math.max(0, ctx.alignStack.length - change.close));
      }
      index += 1;
      continue;
    }
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const close = skipToClose(tokens, index);
      const ordered = token.type === 'ordered_list_open';
      let number = Number(token.attrGet('start') || 1);
      let cursor = index + 1;
      while (cursor < close) {
        if (tokens[cursor].type !== 'list_item_open') {
          cursor += 1;
          continue;
        }
        const itemEnd = skipToClose(tokens, cursor);
        const task = taskMarker(tokens, cursor);
        const markerWidth = 1.45 * emPx;
        const indent = ctx.level * markerWidth;
        const innerWidth = Math.max(40, width - markerWidth);
        const inner = await parseRange(tokens, cursor + 1, itemEnd, {
          ...ctx,
          compact: true,
          level: ctx.level + 1,
        }, innerWidth);
        for (const block of inner) {
          if (block.listed) continue;
          block.listed = true;
          block.indent = indent;
          block.markerWidth = markerWidth;
        }
        if (inner[0] && !inner[0].marker) inner[0].marker = task || (ordered ? `${number}.` : '•');
        blocks.push(...inner);
        number += 1;
        cursor = itemEnd + 1;
      }
      index = close + 1;
      continue;
    }
    if (token.type === 'blockquote_open') {
      const close = skipToClose(tokens, index);
      const alert = alertKind(tokens, index);
      const innerWidth = Math.max(40, width - 14);
      const inner = await parseRange(tokens, index + 1, close, { ...ctx, compact: true }, innerWidth);
      if (alert) {
        const [label, color] = ALERTS[alert];
        inner.unshift(paragraphBlock({ ...ctx, compact: true }, [{ text: label, bold: true, color }], innerWidth));
      }
      const contentHeight = inner.reduce((sum, block) => sum + block.height, 0);
      const marginTop = 0.8 * emPx;
      const marginBottom = emPx;
      if (inner.length && marginTop + marginBottom + contentHeight <= ctx.pageHeight) {
        blocks.push({
          type: 'quote',
          children: inner,
          accent: alert ? ALERTS[alert][1] : undefined,
          ...blockBox(marginTop, marginBottom, contentHeight),
        });
      } else {
        blocks.push(...inner);
      }
      index = close + 1;
      continue;
    }
    if (token.type === 'dt_open') {
      const close = skipToClose(tokens, index);
      const runs = await resolveRuns(ctx, parseInlines(tokens[index + 1]), width);
      blocks.push(paragraphBlock({ ...ctx, compact: true }, runs.map((run) => ({ ...run, bold: true })), width, currentAlign(ctx)));
      index = close + 1;
      continue;
    }
    if (token.type === 'dd_open' || token.type === 'footnote_open') {
      const close = skipToClose(tokens, index);
      const markerWidth = 1.45 * emPx;
      const footnoteItem = token.type === 'footnote_open';
      const inner = await parseRange(tokens, index + 1, close, {
        ...ctx,
        compact: true,
        small: ctx.small || footnoteItem,
        level: ctx.level + 1,
      }, Math.max(40, width - markerWidth));
      for (const block of inner) {
        if (block.listed) continue;
        block.listed = true;
        block.indent = ctx.level * markerWidth;
        block.markerWidth = markerWidth;
      }
      if (footnoteItem && inner[0]) {
        const number = footnoteNumber(token.meta);
        inner[0].marker = `${number}.`;
        inner[0].anchor = `fn-${number}`;
      }
      blocks.push(...inner);
      index = close + 1;
      continue;
    }
    if (token.type === 'footnote_block_open') {
      blocks.push({ type: 'hr', ...blockBox(1.3 * emPx, 0.6 * emPx, 1) });
      index += 1;
      continue;
    }
    if (token.type === 'table_open') {
      const close = skipToClose(tokens, index);
      const rawRows = [];
      let header = false;
      for (let cursor = index; cursor < close; cursor += 1) {
        if (tokens[cursor].type === 'thead_open') header = true;
        if (tokens[cursor].type === 'tbody_open') header = false;
        if (tokens[cursor].type === 'tr_open') {
          const rowEnd = skipToClose(tokens, cursor);
          const row = [];
          for (let cell = cursor + 1; cell < rowEnd; cell += 1) {
            if (tokens[cell].type === 'th_open' || tokens[cell].type === 'td_open') {
              const inline = tokens[cell + 1];
              const align = String(tokens[cell].attrGet('style') || '').match(/text-align:\s*(center|right|left)/)?.[1];
              row.push({ runs: parseInlines(inline?.type === 'inline' ? inline : { children: [] }), align });
            }
          }
          row.header = header;
          rawRows.push(row);
          cursor = rowEnd;
        }
      }
      if (rawRows.length) blocks.push(...tableRowBlocks(ctx.doc, await resolveRows(ctx, rawRows, width), width));
      index = close + 1;
      continue;
    }
    if (token.type === 'hr') {
      blocks.push({ type: 'hr', ...blockBox(1.3 * emPx, 1.3 * emPx, 1) });
      index += 1;
      continue;
    }
    index += 1;
  }
  return blocks;
}

export async function buildBlocks(markdown, { doc, basedir, mermaid, contentWidth, pageHeight }) {
  const tokens = createParser().parse(markdown, {});
  const ctx = {
    doc,
    basedir,
    mermaid,
    pageHeight,
    compact: false,
    small: false,
    level: 0,
    alignStack: [],
    slugs: new Map(),
    diagramIndex: 0,
    warnings: [],
  };
  const blocks = await parseRange(tokens, 0, tokens.length, ctx, contentWidth);
  if (blocks[0]) blocks[0].marginTop = 0;
  if (blocks[0]) blocks[0].height = blocks[0].contentHeight + blocks[0].marginBottom;
  return { blocks, warnings: ctx.warnings };
}
