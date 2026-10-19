import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const PIXEL_RATIO = 3;
const FONT_STACK = "'trebuchet ms', verdana, arial, 'Noto Sans JP', 'MdSymbols', sans-serif";

let session;

function pageHtml() {
  const noto = path.dirname(require.resolve('@fontsource/noto-sans-jp/package.json'));
  const mermaidJs = require.resolve('mermaid/dist/mermaid.min.js');
  const katexDir = path.dirname(require.resolve('katex/dist/katex.min.js'));
  const href = (file) => pathToFileURL(file).href;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${href(path.join(noto, '400.css'))}">
<link rel="stylesheet" href="${href(path.join(noto, '700.css'))}">
<link rel="stylesheet" href="${href(path.join(katexDir, 'katex.min.css'))}">
<script src="${href(path.join(katexDir, 'katex.min.js'))}"></script>
<style>
@font-face { font-family: 'MdSymbols'; font-weight: 400; src: url('${href(path.join(here, '..', 'assets', 'fonts', 'MdSymbols-Regular.ttf'))}'); }
@font-face { font-family: 'MdSymbols'; font-weight: 700; src: url('${href(path.join(here, '..', 'assets', 'fonts', 'MdSymbols-Bold.ttf'))}'); }
html, body { margin: 0; padding: 0; background: #fff; font-family: ${FONT_STACK}; }
#stage { display: inline-block; padding: 0; }
#stage svg { display: block; }
#stage.math { padding: 1px 2px; font-size: 14px; color: #1c1c1c; }
#stage.math .katex-display { margin: 0; }
</style>
<script src="${href(mermaidJs)}"></script>
</head>
<body><div id="stage"></div></body>
</html>`;
}

async function launchBrowser() {
  try {
    return await puppeteer.launch({ headless: 'shell' });
  } catch (error) {
    if (!/sandbox/i.test(String(error?.message))) throw error;
    return puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
  }
}

async function openSession() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md-to-pdf-'));
  let browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`Mermaid 図や数式を描くためのブラウザを起動できませんでした: ${message}\n`
      + 'npx puppeteer browsers install chrome-headless-shell でブラウザを入れるか、--no-mermaid を付けてください。');
  }
  const file = path.join(dir, 'mermaid.html');
  await writeFile(file, pageHtml());
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: PIXEL_RATIO });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate((fontFamily) => {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'antiscript',
      theme: 'default',
      fontFamily,
      flowchart: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      class: { useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
      journey: { useMaxWidth: false },
      pie: { useMaxWidth: false },
    });
  }, FONT_STACK);
  return { browser, page, dir, serial: 0 };
}

async function currentSession() {
  if (!session) session = openSession();
  try {
    return await session;
  } catch (error) {
    session = undefined;
    throw error;
  }
}

export async function closeDiagramRenderer() {
  if (!session) return;
  const pending = session;
  session = undefined;
  try {
    const { browser, dir } = await pending;
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  } catch {
    // 起動に失敗したセッションは閉じるものがない
  }
}

const STROKE_SCALE = 0.75;

function strokeFactor(size, fit) {
  if (!fit) return STROKE_SCALE;
  const scale = Math.min(1, fit.width / size.width, fit.height / size.height);
  return STROKE_SCALE * Math.min(2.4, Math.max(1, 1 / scale));
}

export async function renderDiagram(source, fit) {
  const current = await currentSession();
  current.serial += 1;
  const id = `diagram${current.serial}`;
  const { page } = current;
  const size = await page.evaluate(async (diagramId, text) => {
    const sample = text.replace(/\s+/g, '');
    await Promise.all([
      document.fonts.load("16px 'Noto Sans JP'", sample),
      document.fonts.load("bold 16px 'Noto Sans JP'", sample),
      document.fonts.load("16px 'MdSymbols'", sample),
    ]);
    await document.fonts.ready;
    const stage = document.getElementById('stage');
    stage.className = '';
    document.documentElement.style.background = '';
    document.body.style.background = '';
    stage.innerHTML = '';
    try {
      const { svg } = await window.mermaid.render(diagramId, text);
      stage.innerHTML = svg;
    } catch (error) {
      document.getElementById(`d${diagramId}`)?.remove();
      return { error: error?.message || String(error) };
    }
    const rect = stage.querySelector('svg').getBoundingClientRect();
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  }, id, source);
  if (size.error) throw new Error(size.error.split('\n').slice(0, 3).join(' '));
  if (!size.width || !size.height || size.width > 20000 || size.height > 20000) {
    throw new Error('図の大きさを決められませんでした');
  }
  await page.evaluate((factor) => {
    const svg = document.querySelector('#stage svg');
    for (const el of svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')) {
      if (el.closest('marker')) continue;
      const style = getComputedStyle(el);
      if (style.stroke === 'none' || !style.stroke) continue;
      const width = Number.parseFloat(style.strokeWidth) || 1;
      el.style.setProperty('stroke-width', `${width * factor}px`, 'important');
      if (style.strokeDasharray && style.strokeDasharray !== 'none') {
        const dashes = style.strokeDasharray.split(/[\s,]+/).map((part) => `${(Number.parseFloat(part) || 0) * factor}px`);
        el.style.setProperty('stroke-dasharray', dashes.join(' '), 'important');
      }
    }
  }, strokeFactor(size, fit));
  await page.setViewport({
    width: Math.max(1600, size.width + 16),
    height: Math.max(1200, size.height + 16),
    deviceScaleFactor: PIXEL_RATIO,
  });
  const element = await page.$('#stage svg');
  const png = Buffer.from(await element.screenshot({ type: 'png', omitBackground: false }));
  return { png, width: size.width, height: size.height };
}

export async function renderMath(tex, { display = false } = {}) {
  const { page } = await currentSession();
  const size = await page.evaluate(async (source, displayMode) => {
    const stage = document.getElementById('stage');
    stage.className = 'math';
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    stage.innerHTML = window.katex.renderToString(source, { displayMode, throwOnError: false, output: 'html' });
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    (stage.querySelector('.katex-html') || stage).append(probe);
    await document.fonts.ready;
    const box = stage.getBoundingClientRect();
    const base = probe.getBoundingClientRect().top - box.top;
    probe.remove();
    return { width: Math.ceil(box.width), height: Math.ceil(box.height), ascent: base };
  }, tex, display);
  if (!size.width || !size.height) throw new Error('数式の大きさを決められませんでした');
  await page.setViewport({
    width: Math.max(1600, size.width + 16),
    height: Math.max(1200, size.height + 16),
    deviceScaleFactor: PIXEL_RATIO,
  });
  const element = await page.$('#stage');
  const png = Buffer.from(await element.screenshot({ type: 'png', omitBackground: true }));
  return { png, width: size.width, height: size.height, ascent: Math.min(size.height, Math.max(0, size.ascent)) };
}
