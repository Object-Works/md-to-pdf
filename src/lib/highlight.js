import hljs from 'highlight.js';

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

export function highlightRuns(code, lang) {
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
