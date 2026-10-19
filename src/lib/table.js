import { BODY, blockBox, emPx, lineHeightPx, measureRuns, wrapRuns } from './text.js';

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
      return { lines, align: cell.align };
    });
    const height = Math.max(...cells.map((cell) => cell.lines.reduce((total, line) => total + line.height, 0)), lineH) + padY * 2;
    return { header: Boolean(row.header), height, cells };
  });
  return { columns: columnsWidth, rows: laid, floors: metrics.map((metric) => metric.floor), padX, padY };
}

let tableSerial = 0;

export function tableRowBlocks(doc, rawRows, width) {
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
