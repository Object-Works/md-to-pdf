import { fontNameFor } from './fonts.js';
import { lengthToPx } from './options.js';
import { pxToPt, stringWidth } from './text.js';

function bindHeadings(blocks, pageHeight, breakLevels = [1]) {
  const separator = (block) => block.type === 'hr' || block.type === 'spacer';
  let nodes = blocks.map((block, index) => {
    let back = index - 1;
    while (back >= 0 && separator(blocks[back])) back -= 1;
    const breakBefore = block.role === 'heading'
      && breakLevels.includes(block.level)
      && back >= 0
      && blocks[back].role !== 'heading';
    return { blocks: [block], height: block.height, breakBefore };
  });
  nodes = nodes.filter((node, index) => {
    if (node.blocks[0].type !== 'hr') return true;
    let ahead = index + 1;
    while (ahead < nodes.length && separator(nodes[ahead].blocks[0])) ahead += 1;
    return !nodes[ahead]?.breakBefore;
  });
  for (let level = 6; level >= 1; level -= 1) {
    const next = [];
    let index = 0;
    while (index < nodes.length) {
      const node = nodes[index];
      const heading = node.blocks.length === 1 && node.blocks[0].role === 'heading' && node.blocks[0].level === level;
      if (!heading) {
        next.push(node);
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < nodes.length) {
        const candidate = nodes[end];
        const boundary = candidate.breakBefore || (candidate.blocks.length === 1
          && candidate.blocks[0].role === 'heading'
          && candidate.blocks[0].level <= level);
        if (boundary) break;
        end += 1;
      }
      const section = nodes.slice(index, end);
      const height = section.reduce((sum, item) => sum + item.height, 0);
      if (section.length > 1 && height <= pageHeight) {
        next.push({ blocks: section.flatMap((item) => item.blocks), height, breakBefore: node.breakBefore });
        index = end;
        continue;
      }
      if (section.length > 1 && node.height + section[1].height <= pageHeight) {
        next.push({
          blocks: [...node.blocks, ...section[1].blocks],
          height: node.height + section[1].height,
          breakBefore: node.breakBefore,
        });
        index += 2;
        continue;
      }
      next.push(node);
      index += 1;
    }
    nodes = next;
  }
  return nodes;
}

function repeatedHeader(block) {
  if (block?.type !== 'table-row' || block.isHeader || !block.headerRow) return null;
  return {
    type: 'table-row',
    tableId: block.tableId,
    columns: block.columns,
    padX: block.padX,
    padY: block.padY,
    row: block.headerRow,
    isHeader: true,
    headerRow: block.headerRow,
    rowIndex: 0,
    repeated: true,
    marginTop: 0,
    marginBottom: 0,
    contentHeight: block.headerRow.height,
    height: block.headerRow.height,
  };
}

function headerBefore(atom, pageEmpty, previous) {
  const first = atom.blocks.find((block) => block.type === 'table-row' && !block.isHeader);
  if (!first) return null;
  const sameTable = previous?.type === 'table-row' && previous.tableId === first.tableId;
  if (!pageEmpty && sameTable) return null;
  const already = atom.blocks.some((block) => block.type === 'table-row' && block.isHeader && block.tableId === first.tableId);
  if (already) return null;
  return repeatedHeader(first);
}

function paginate(atoms, pageHeight) {
  const pages = [];
  let page = [];
  let used = 0;
  let previous = null;
  const flush = () => {
    if (page.length === 0) return;
    pages.push(page);
    page = [];
    used = 0;
    previous = null;
  };
  const place = (atom, header) => {
    if (header) {
      page.push(header);
      used += header.height;
      previous = header;
    }
    for (const block of atom.blocks) {
      page.push(block);
      used += block.height;
      previous = block;
    }
  };
  for (const atom of atoms) {
    let header = headerBefore(atom, page.length === 0, previous);
    const height = atom.height + (header?.height || 0);
    const overflows = used > 0 && used + height > pageHeight + 0.5;
    if ((atom.breakBefore && (page.length > 0 || pages.length > 0)) || overflows) {
      flush();
      header = headerBefore(atom, true, null);
    }
    place(atom, header);
  }
  flush();
  return pages.length ? pages : [[]];
}

const ITALIC_SKEW = 0.2;

function addDestination(doc, name, xPt, yPt) {
  if (name) doc.addNamedDestination(name, 'XYZ', xPt, yPt, null);
}

function linkArea(doc, href, xPt, yPt, widthPt, heightPt) {
  if (!href) return;
  if (href.startsWith('#')) {
    let name = href.slice(1);
    try {
      name = decodeURIComponent(name);
    } catch {
      // そのままの名前で探す
    }
    doc.goTo(xPt, yPt, widthPt, heightPt, name);
  } else {
    doc.link(xPt, yPt, widthPt, heightPt, href);
  }
}

function drawTextRun(doc, run, xPt, baseline) {
  const size = run.fontSizePt;
  const y = baseline + (run.rise || 0);
  const widthPt = pxToPt(run.width);
  const background = run.code ? '#f3f4f6' : run.highlight;
  if (background) {
    doc.save();
    doc.rect(xPt, y - size * 0.95, widthPt, size * 1.25).fill(background);
    doc.restore();
  }
  doc.save();
  if (run.italic) doc.transform(1, 0, -ITALIC_SKEW, 1, ITALIC_SKEW * y, 0);
  doc.font(run.font).fontSize(size).fillColor(run.color || '#1c1c1c');
  doc.text(run.text, xPt, y, { lineBreak: false, baseline: 'alphabetic' });
  doc.restore();
  const rule = (offset) => {
    doc.save();
    doc.moveTo(xPt, y + offset).lineTo(xPt + widthPt, y + offset)
      .lineWidth(Math.max(0.5, size * 0.065))
      .strokeColor(run.color || '#1c1c1c')
      .stroke();
    doc.restore();
  };
  if (run.strike) rule(-size * 0.3);
  if (run.underline) rule(size * 0.13);
  addDestination(doc, run.anchor, xPt, y - size);
  linkArea(doc, run.href, xPt, y - size * 0.95, widthPt, size * 1.25);
}

function drawRuns(doc, lines, xPx, yPx, origin, align, widthPx) {
  let y = yPx;
  for (const line of lines) {
    let x = xPx;
    const free = Math.max(0, (widthPx || 0) - line.width);
    if (align === 'center') x += free / 2;
    else if (align === 'right') x += free;
    const baseline = origin.y + pxToPt(y + line.baseline);
    for (const run of line.runs) {
      const xPt = origin.x + pxToPt(x);
      if (run.image) {
        const top = baseline - pxToPt(run.ascent);
        doc.image(run.image, xPt, top, { width: pxToPt(run.width), height: pxToPt(run.height) });
        linkArea(doc, run.href, xPt, top, pxToPt(run.width), pxToPt(run.height));
      } else if (run.text) {
        drawTextRun(doc, run, xPt, baseline);
      }
      x += run.width;
    }
    y += line.height;
  }
  return y;
}

function drawBlock(doc, block, x, y, origin, columnWidth) {
  const top = y + (block.marginTop || 0);
  if (block.type === 'spacer') return;
  if (block.type === 'hr') {
    const yPt = origin.y + pxToPt(top);
    doc.save();
    doc.moveTo(origin.x + pxToPt(x), yPt)
      .lineTo(origin.x + pxToPt(x + columnWidth), yPt)
      .lineWidth(0.8)
      .strokeColor('#d8d8d8')
      .stroke();
    doc.restore();
    return;
  }
  if (block.type === 'text') {
    const indent = block.indent || 0;
    const textX = x + indent + (block.markerWidth || 0);
    addDestination(doc, block.anchor, origin.x + pxToPt(x), origin.y + pxToPt(y));
    if (block.marker) {
      const baseline = origin.y + pxToPt(top + (block.lines[0]?.baseline || 0));
      doc.font(fontNameFor([...block.marker][0], false)).fontSize(block.style?.fontPt || 10.5).fillColor(block.markerColor || '#1c1c1c');
      doc.text(block.marker, origin.x + pxToPt(x + indent), baseline, {
        lineBreak: false,
        baseline: 'alphabetic',
      });
    }
    drawRuns(doc, block.lines, textX, top, origin, block.align, x + columnWidth - textX);
    if (block.border) {
      const borderY = top + block.contentHeight - (block.level === 1 ? 2.5 : 1);
      doc.save();
      doc.moveTo(origin.x + pxToPt(textX), origin.y + pxToPt(borderY))
        .lineTo(origin.x + pxToPt(x + columnWidth), origin.y + pxToPt(borderY))
        .lineWidth(block.level === 1 ? 1.8 : 0.7)
        .strokeColor(block.level === 1 ? '#202124' : '#c8c8c8')
        .stroke();
      doc.restore();
    }
    return;
  }
  if (block.type === 'code') {
    const xPt = origin.x + pxToPt(x);
    const yPt = origin.y + pxToPt(top);
    const widthPt = pxToPt(columnWidth);
    const heightPt = pxToPt(block.contentHeight);
    doc.save();
    doc.roundedRect(xPt, yPt, widthPt, heightPt, 4).fill('#f6f8fa');
    doc.roundedRect(xPt, yPt, widthPt, heightPt, 4).lineWidth(0.7).strokeColor('#e5e7eb').stroke();
    doc.restore();
    drawRuns(doc, block.lines, x + block.padX, top + block.padY, origin);
    return;
  }
  if (block.type === 'quote') {
    const xPt = origin.x + pxToPt(x);
    const yPt = origin.y + pxToPt(top);
    doc.save();
    doc.rect(xPt, yPt, pxToPt(columnWidth), pxToPt(block.contentHeight)).fill(block.accent ? '#ffffff' : '#f6f7f8');
    doc.rect(xPt, yPt, pxToPt(3), pxToPt(block.contentHeight)).fill(block.accent || '#9aa0a6');
    doc.restore();
    let cursor = top;
    for (const child of block.children) {
      drawBlock(doc, child, x + 12, cursor, origin, columnWidth - 14);
      cursor += child.height;
    }
    return;
  }
  if (block.type === 'image') {
    const free = Math.max(0, columnWidth - block.drawWidth);
    const offset = block.align === 'center' ? free / 2 : block.align === 'right' ? free : 0;
    const xPt = origin.x + pxToPt(x + offset);
    const yPt = origin.y + pxToPt(top);
    doc.image(block.image, xPt, yPt, { width: pxToPt(block.drawWidth), height: pxToPt(block.drawHeight) });
    linkArea(doc, block.href, xPt, yPt, pxToPt(block.drawWidth), pxToPt(block.drawHeight));
    return;
  }
  if (block.type === 'diagram') {
    const offset = Math.max(0, (columnWidth - block.drawWidth) / 2);
    doc.image(block.image, origin.x + pxToPt(x + offset), origin.y + pxToPt(top), {
      width: pxToPt(block.drawWidth),
      height: pxToPt(block.drawHeight),
    });
    return;
  }
  if (block.type === 'table-row') {
    let cellX = x;
    const row = block.row;
    row.cells.forEach((cell, cellIndex) => {
      const column = block.columns[cellIndex];
      const xPt = origin.x + pxToPt(cellX);
      const yPt = origin.y + pxToPt(top);
      doc.save();
      const fill = row.header ? '#f3f4f6' : block.rowIndex % 2 === 0 ? '#fafafa' : '#ffffff';
      doc.lineWidth(0.6).rect(xPt, yPt, pxToPt(column), pxToPt(row.height)).fillAndStroke(fill, '#d0d0d0');
      doc.restore();
      drawRuns(doc, cell.lines, cellX + block.padX, top + block.padY, origin, cell.align, column - block.padX * 2);
      cellX += column;
    });
  }
}

function drawPageNumber(doc, settings, pageIndex, pageCount, margin) {
  if (!settings.pageNumbers) return;
  const label = `${pageIndex + 1} / ${pageCount}`;
  doc.font('Noto').fontSize(9).fillColor('#5f6368');
  const width = stringWidth(doc, label, 'Noto', 9) * (72 / 96);
  const y = doc.page.height - margin.bottom + 8;
  doc.text(label, doc.page.width - margin.right - width, Math.min(y, doc.page.height - 16), {
    lineBreak: false,
    baseline: 'top',
  });
}

export function composePdf(doc, blocks, settings) {
  const margin = {
    top: pxToPt(lengthToPx(settings.margin.top)),
    right: pxToPt(lengthToPx(settings.margin.right)),
    bottom: pxToPt(lengthToPx(settings.margin.bottom)),
    left: pxToPt(lengthToPx(settings.margin.left)),
  };
  const atoms = bindHeadings(blocks, settings.layoutHeight, settings.pageBreak);
  const pages = paginate(atoms, settings.layoutHeight);
  const origin = { x: margin.left, y: margin.top };
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    let y = 0;
    for (const block of page) {
      drawBlock(doc, block, 0, y, origin, settings.layoutWidth);
      y += block.height;
    }
  });
  if (settings.pageNumbers) {
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      drawPageNumber(doc, settings, index, range.count, margin);
    }
  }
}
