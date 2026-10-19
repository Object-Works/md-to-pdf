import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { renderDiagram } from './diagrams.js';
import { BODY, emPx, lineHeightPx, measureRuns, wrapRuns } from './text.js';

const HEADING_PT = { 1: 22, 2: 16, 3: 13, 4: 11.5, 5: 11.5, 6: 11.5 };
const HLJS_COLORS = [
  ['hljs-keyword', '#cf222e'],
  ['hljs-selector-tag', '#cf222e'],
  ['hljs-type', '#cf222e'],
  ['hljs-string', '#0a3069'],
  ['hljs-attr', '#0a3069'],
  ['hljs-addition', '#0a3069'],
  ['hljs-number', '#0550ae'],
  ['hljs-literal', '#0550ae'],
  ['hljs-title', '#8250df'],
  ['hljs-section', '#8250df'],
  ['hljs-name', '#8250df'],
  ['hljs-built_in', '#953800'],
  ['hljs-variable', '#953800'],
  ['hljs-template-variable', '#953800'],
  ['hljs-comment', '#57606a'],
  ['hljs-quote', '#57606a'],
];

function decodeHtml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function colorFor(className) {
  for (const [name, color] of HLJS_COLORS) {
    if (className.includes(name)) return color;
  }
  return '#24292f';
}

function highlightRuns(code, lang) {
  if (!lang || !hljs.getLanguage(lang)) return [{ text: code, code: true }];
  let html = '';
  try {
    html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return [{ text: code, code: true }];
  }
  const runs = [];
  const stack = [];
  const pattern = /<span class="([^"]*)">|<\/span>|<[^>]+>|[^<]+/g;
  for (const match of html.matchAll(pattern)) {
    const token = match[0];
    if (token.startsWith('</span>')) stack.pop();
    else if (token.startsWith('<span')) stack.push(match[1]);
    else if (token.startsWith('<')) continue;
    else {
      runs.push({
        text: decodeHtml(token),
        code: true,
        color: colorFor(stack.join(' ')),
      });
    }
  }
  return runs.length ? runs : [{ text: code, code: true }];
}

function skipToClose(tokens, index) {
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

function parseInlines(token) {
  const runs = [];
  const images = [];
  let bold = 0;
  let italic = 0;
  let link = false;
  for (const child of token?.children || []) {
    if (child.type === 'strong_open') bold += 1;
    else if (child.type === 'strong_close') bold = Math.max(0, bold - 1);
    else if (child.type === 'em_open') italic += 1;
    else if (child.type === 'em_close') italic = Math.max(0, italic - 1);
    else if (child.type === 's_open' || child.type === 's_close') continue;
    else if (child.type === 'link_open') link = true;
    else if (child.type === 'link_close') link = false;
    else if (child.type === 'code_inline') runs.push({ text: child.content, code: true, bold: bold > 0 });
    else if (child.type === 'softbreak') runs.push({ text: ' ' });
    else if (child.type === 'hardbreak') runs.push({ break: true, text: '\n' });
    else if (child.type === 'image') {
      images.push({ src: child.attrGet('src'), alt: child.content || '' });
    } else if (child.type === 'html_inline') {
      if (/<br\s*\/?>/i.test(child.content)) runs.push({ break: true, text: '\n' });
    } else if (child.type === 'text') {
      runs.push({
        text: child.content,
        bold: bold > 0,
        italic: italic > 0,
        link,
        color: link ? '#0b57d0' : undefined,
      });
    }
  }
  return { runs, images };
}

function blockBox(marginTop, marginBottom, contentHeight) {
  return {
    marginTop,
    marginBottom,
    contentHeight,
    height: marginTop + contentHeight + marginBottom,
  };
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

function imageBlock(doc, image, width) {
  const file = localPath(image.src, image.basedir);
  const margins = { top: 0.4 * emPx, bottom: 0.8 * emPx };
  if (!file) return textBlock(doc, [{ text: image.alt || image.src || '' }], width, BODY, margins);
  try {
    const opened = doc.openImage(readFileSync(file));
    const scale = Math.min(1, width / opened.width);
    const drawWidth = opened.width * scale;
    const drawHeight = opened.height * scale;
    return {
      type: 'image',
      image: opened,
      drawWidth,
      drawHeight,
      ...blockBox(margins.top, margins.bottom, drawHeight),
    };
  } catch {
    return textBlock(doc, [{ text: image.alt || path.basename(file) }], width, BODY, margins);
  }
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

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function fitWidths(widths, tableWidth) {
  const total = sum(widths);
  const scale = total > 0 ? tableWidth / total : 1;
  const fitted = widths.map((value) => value * scale);
  const drift = tableWidth - sum(fitted);
  fitted[fitted.length - 1] += drift;
  return fitted;
}

function assignColumnWidths(metrics, tableWidth) {
  const ideals = metrics.map((metric) => Math.max(metric.ideal, metric.floor, 1));
  const floors = metrics.map((metric, index) => Math.min(Math.max(metric.floor, 1), ideals[index]));
  const sumIdeal = sum(ideals);
  const sumFloor = sum(floors);
  if (sumFloor >= tableWidth) return fitWidths(floors, tableWidth);
  if (sumIdeal <= tableWidth) return fitWidths(ideals, tableWidth);

  const threshold = Math.max(tableWidth * 0.42, 160);
  const flex = ideals.map((ideal) => ideal > threshold);
  const flexCount = flex.filter(Boolean).length;
  const fixedSum = ideals.reduce((total, ideal, index) => total + (flex[index] ? 0 : ideal), 0);
  if (flexCount === 0 || fixedSum >= tableWidth) {
    const extra = tableWidth - sumFloor;
    const grow = ideals.map((ideal, index) => Math.max(0, ideal - floors[index]));
    const growSum = sum(grow) || 1;
    return fitWidths(floors.map((floor, index) => floor + extra * (grow[index] / growSum)), tableWidth);
  }

  const base = ideals.map((ideal, index) => (flex[index] ? floors[index] : ideal));
  const extra = tableWidth - sum(base);
  const weightCap = Math.max(threshold, extra / flexCount);
  const weights = ideals.map((ideal, index) => (
    flex[index] ? Math.min(Math.max(0, ideal - floors[index]), weightCap) : 0
  ));
  const weightSum = sum(weights) || 1;
  return fitWidths(base.map((value, index) => value + extra * (weights[index] / weightSum)), tableWidth);
}

function layoutCells(doc, rows, width, fontPt, boldHeader) {
  const columns = Math.max(...rows.map((row) => row.length), 1);
  const padX = 6;
  const padY = 3;
  const style = { fontPt, lineHeight: 1.45, color: BODY.color };
  const metrics = Array.from({ length: columns }, () => ({ ideal: padX * 2, floor: padX * 2 }));
  for (const [rowIndex, row] of rows.entries()) {
    const cellStyle = { ...style, bold: Boolean(boldHeader && rowIndex === 0 && row.header) };
    row.forEach((cell, index) => {
      const measured = measureRuns(doc, cell.runs, cellStyle);
      metrics[index].ideal = Math.max(metrics[index].ideal, measured.line + padX * 2 + 2);
      metrics[index].floor = Math.max(metrics[index].floor, measured.unbreakable + padX * 2 + 2);
    });
  }
  const columnsWidth = assignColumnWidths(metrics, width);
  const lineH = lineHeightPx(fontPt, 1.45);
  const laid = rows.map((row, rowIndex) => {
    const cells = columnsWidth.map((columnWidth, index) => {
      const cell = row[index] || { runs: [] };
      const lines = wrapRuns(doc, cell.runs, Math.max(12, columnWidth - padX * 2), {
        ...style,
        bold: boldHeader && rowIndex === 0 && row.header,
      });
      return { lines };
    });
    const height = Math.max(...cells.map((cell) => cell.lines.reduce((total, line) => total + line.height, 0)), lineH) + padY * 2;
    return { header: Boolean(row.header), height, cells };
  });
  return { columns: columnsWidth, rows: laid, floors: metrics.map((metric) => metric.floor), padX, padY };
}

let tableSerial = 0;

function tableRowBlocks(doc, rawRows, width) {
  const sizes = [8.75, 8, 7.5];
  let laid = null;
  for (const fontPt of sizes) {
    laid = layoutCells(doc, rawRows, width, fontPt, true);
    const sumFloor = laid.floors.reduce((total, value) => total + value, 0);
    if (sumFloor <= width || fontPt === sizes[sizes.length - 1]) break;
  }
  tableSerial += 1;
  const tableId = tableSerial;
  const header = laid.rows.find((row) => row.header) || null;
  const body = laid.rows.filter((row) => !row.header);
  const rows = [];
  if (header) rows.push({ row: header, isHeader: true });
  for (const row of (body.length ? body : laid.rows)) {
    if (header && row === header) continue;
    rows.push({ row, isHeader: false });
  }
  return rows.map((entry, index) => ({
    type: 'table-row',
    tableId,
    columns: laid.columns,
    padX: laid.padX,
    padY: laid.padY,
    row: entry.row,
    isHeader: entry.isHeader,
    headerRow: header,
    rowIndex: index,
    ...blockBox(index === 0 ? 0.55 * emPx : 0, index === rows.length - 1 ? emPx : 0, entry.row.height),
  }));
}

async function parseRange(tokens, start, end, ctx, width) {
  const blocks = [];
  let index = start;
  while (index < end) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const fontPt = HEADING_PT[level] || 11.5;
      const fontPx = fontPt * (96 / 72);
      const { runs, images } = parseInlines(tokens[index + 1]);
      blocks.push(textBlock(ctx.doc, runs, width, {
        fontPt,
        lineHeight: 1.4,
        bold: true,
        color: '#1c1c1c',
      }, headingMargins(level, fontPx), { role: 'heading', level, border: level <= 2 }));
      for (const image of images) blocks.push(imageBlock(ctx.doc, { ...image, basedir: ctx.basedir }, width));
      index += 3;
      continue;
    }
    if (token.type === 'paragraph_open') {
      const { runs, images } = parseInlines(tokens[index + 1]);
      const visible = runs.some((run) => run.text && run.text.trim());
      if (visible) {
        blocks.push(textBlock(ctx.doc, runs, width, {
          ...BODY,
          color: BODY.color,
        }, ctx.compact
          ? { top: 0.15 * emPx, bottom: 0.2 * emPx }
          : { top: 0.35 * emPx, bottom: 0.7 * emPx }));
      }
      for (const image of images) blocks.push(imageBlock(ctx.doc, { ...image, basedir: ctx.basedir }, width));
      index += 3;
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
          const rendered = await diagramBlock(ctx.doc, source.trim(), width, ctx.pageHeight, current, reserve);
          blocks.push(rendered.block);
          if (rendered.warning) ctx.warnings.push(rendered.warning);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const preview = source.trim().split('\n')[0]?.slice(0, 40) || '';
          ctx.errors.push({ index: current, preview, message });
          blocks.push(...codeBlocks(ctx.doc, source, '', width, ctx.pageHeight));
        }
      } else {
        blocks.push(...codeBlocks(ctx.doc, source, lang, width, ctx.pageHeight));
      }
      index += 1;
      continue;
    }
    if (token.type === 'html_block' || token.type === 'html_inline') {
      const height = token.content.match(/height:\s*([0-9.]+)px/i);
      if (height) {
        blocks.push({
          type: 'spacer',
          ...blockBox(0, 0, Number(height[1])),
        });
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
        if (inner[0] && !inner[0].marker) inner[0].marker = ordered ? `${number}.` : '•';
        blocks.push(...inner);
        number += 1;
        cursor = itemEnd + 1;
      }
      index = close + 1;
      continue;
    }
    if (token.type === 'blockquote_open') {
      const close = skipToClose(tokens, index);
      const inner = await parseRange(tokens, index + 1, close, { ...ctx, compact: true }, Math.max(40, width - 14));
      const contentHeight = inner.reduce((sum, block) => sum + block.height, 0);
      const marginTop = 0.8 * emPx;
      const marginBottom = emPx;
      if (inner.length && marginTop + marginBottom + contentHeight <= ctx.pageHeight) {
        blocks.push({
          type: 'quote',
          children: inner,
          ...blockBox(marginTop, marginBottom, contentHeight),
        });
      } else {
        blocks.push(...inner);
      }
      index = close + 1;
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
              row.push(parseInlines(inline?.type === 'inline' ? inline : { children: [] }));
            }
          }
          row.header = header;
          rawRows.push(row);
          cursor = rowEnd;
        }
      }
      if (rawRows.length) blocks.push(...tableRowBlocks(ctx.doc, rawRows, width));
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
  const parser = new MarkdownIt({ html: true, linkify: true, typographer: false });
  const tokens = parser.parse(markdown, {});
  const ctx = {
    doc,
    basedir,
    mermaid,
    pageHeight,
    compact: false,
    level: 0,
    diagramIndex: 0,
    warnings: [],
    errors: [],
  };
  const blocks = await parseRange(tokens, 0, tokens.length, ctx, contentWidth);
  if (blocks[0]) blocks[0].marginTop = 0;
  if (blocks[0]) blocks[0].height = blocks[0].contentHeight + blocks[0].marginBottom;
  if (ctx.errors.length) {
    const lines = ctx.errors.map((error) => {
      const where = error.preview ? `（${error.preview}）` : '';
      return `  図${error.index}${where}: ${error.message}`;
    });
    throw new Error(`Mermaid 図の描画に失敗しました:\n${lines.join('\n')}`);
  }
  return { blocks, warnings: ctx.warnings };
}
