import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isMermaid(lang) {
  return lang === 'mermaid' || lang === 'mmd';
}

export function renderMarkdown(markdown, { basedir, mermaid = true } = {}) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (!lang || isMermaid(lang.toLowerCase()) || !hljs.getLanguage(lang)) return '';
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        return '';
      }
    },
  });

  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (mermaid && isMermaid(lang)) {
      return `<figure class="diagram">${escapeHtml(token.content.trim())}</figure>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src');
    if (src && basedir && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//')) {
      token.attrSet('src', pathToFileURL(path.resolve(basedir, src)).href);
    }
    if (defaultImage) return defaultImage(tokens, idx, options, env, self);
    return self.renderToken(tokens, idx, options);
  };

  return md.render(markdown);
}

export function extractTitle(html, fallback = 'document') {
  const match = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return fallback;
  const text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}
