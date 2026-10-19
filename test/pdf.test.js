import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mdToPdf } from '../src/index.js';

async function pageLines(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const operators = await page.getOperatorList();
    const images = operators.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject).length;
    const content = await page.getTextContent();
    const lines = new Map();
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const current = lines.get(y) ?? [];
      current.push({ x: item.transform[4], text: item.str });
      lines.set(y, current);
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((part) => part.text).join('').trim())
      .filter(Boolean);
    ordered.images = images;
    pages.push(ordered);
  }
  return pages;
}

function pageContaining(pages, text) {
  return pages.findIndex((lines) => lines.some((line) => line.includes(text)));
}

test('小題と図をページの途中で切らない', { timeout: 120000 }, async () => {
  const { contentBoxPx } = await import('../src/options.js');
  const box = contentBoxPx({ format: 'A4', margin: '16mm 16mm 18mm 16mm' });
  const spacer = Math.floor(box.height) - 150;

  const steps = Array.from({ length: 16 }, (_, index) => {
    const label = String(index + 1).padStart(2, '0');
    return `S${index}[手順${label}]`;
  }).join('\n  ');
  const edges = Array.from({ length: 15 }, (_, index) => `S${index} --> S${index + 1}`).join('\n  ');

  const markdown = `# 組版の確認

導入の段落です。この直後の空きで、ページ末尾に小題だけが残る余地を作ります。

<div style="height: ${spacer}px"></div>

## 末尾に残りやすい小題

ORPHAN-CHECK-BODY この小題の直後の段落です。小題とこの文は同じページにあります。

### 図だけの小題

\`\`\`mermaid
flowchart LR
  START[図の始点ラベル] --> GOAL[図の終点ラベル]
\`\`\`

## 縦に長い図

\`\`\`mermaid
flowchart TB
  ${steps}
  ${edges}
\`\`\`
`;

  const directory = await mkdtemp(path.join(tmpdir(), 'md-to-pdf-test-'));
  const source = path.join(directory, 'breaks.md');
  await writeFile(source, markdown);
  const result = await mdToPdf(source, { dest: path.join(directory, 'breaks.pdf') });

  assert.equal(result.content.subarray(0, 5).toString(), '%PDF-');
  const pages = await pageLines(result.content);
  assert.ok(pages.length >= 2);

  const headingPage = pageContaining(pages, '末尾に残りやすい小題');
  const bodyPage = pageContaining(pages, 'ORPHAN-CHECK-BODY');
  assert.equal(headingPage, bodyPage, '小題が直後の段落と別のページに分かれています');

  assert.equal(pages.reduce((sum, page) => sum + page.images, 0), 2, '図は2枚の画像として描かれるはずです');
  const expected = new Map();
  for (const heading of ['図だけの小題', '縦に長い図']) {
    const index = pageContaining(pages, heading);
    assert.ok(index >= 0, `${heading} が PDF にありません`);
    expected.set(index, (expected.get(index) ?? 0) + 1);
  }
  for (const [index, count] of expected) {
    assert.equal(pages[index].images, count, '小題と図が別のページに分かれています');
  }
});
