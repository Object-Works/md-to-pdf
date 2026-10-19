import assert from 'node:assert/strict';
import test from 'node:test';
import { extractTitle, renderMarkdown } from '../src/lib/render-html.js';

const sample = `# 題名

## 節

| 列 | 値 |
| --- | --- |
| A | 1 |

\`\`\`mermaid
flowchart LR
  A[始点] --> B[終点]
\`\`\`

\`\`\`js
const n = 1;
\`\`\`

![図](images/a.png)
`;

test('Mermaid は図、表は折り返し、相対画像は file URL になる', () => {
  const html = renderMarkdown(sample, { basedir: '/tmp/docs' });
  assert.match(html, /<h1>題名<\/h1>/);
  assert.match(html, /<figure class="diagram">flowchart LR/);
  assert.match(html, /<div class="table-wrap"><table>/);
  assert.match(html, /file:\/\/\/tmp\/docs\/images\/a\.png/);
  assert.match(html, /<pre><code class="language-js"/);
  assert.equal(extractTitle(html), '題名');
});

test('Mermaid を無効にするとコードブロックのままになる', () => {
  const html = renderMarkdown('```mermaid\nflowchart LR\n  A-->B\n```\n', { mermaid: false });
  assert.doesNotMatch(html, /<figure class="diagram">/);
  assert.match(html, /<pre><code class="language-mermaid">/);
});
