import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { buildBlocks } from './blocks.js';
import { composePdf } from './compose.js';
import { closeDiagramRenderer } from './diagrams.js';
import { registerPdfFonts } from './fonts.js';
import { resolveSettings, splitFrontMatter } from './options.js';

export async function resolveInput(input) {
  if (typeof input === 'string') {
    const sourcePath = path.resolve(input);
    let raw;
    try {
      raw = await readFile(sourcePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(`ファイルが見つかりません: ${sourcePath}`);
      }
      throw error;
    }
    const { data, body } = splitFrontMatter(raw);
    return {
      data,
      body,
      basedir: path.dirname(sourcePath),
      fallbackTitle: path.basename(sourcePath, path.extname(sourcePath)),
    };
  }

  if (input && typeof input === 'object' && input.path && input.content == null) {
    return resolveInput(input.path);
  }

  if (input && typeof input.content === 'string') {
    const { data, body } = splitFrontMatter(input.content);
    return {
      data,
      body,
      basedir: path.resolve(input.basedir || process.cwd()),
      fallbackTitle: 'document',
    };
  }

  throw new Error('入力が不正です。ファイルパス、または { content } を渡してください');
}

function warnIgnoredOptions(options) {
  if (options.css || options.stylesheet || options.debugHtml) {
    console.error('注意: 追加 CSS と HTML の書き出しは、ブラウザを使わない組版では反映されません。');
  }
}

function titleFrom(blocks, fallback) {
  const heading = blocks.find((block) => block.role === 'heading' && block.level === 1 && block.text);
  return heading?.text || fallback;
}

function pdfBuffer(doc) {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function mdToPdf(input, options = {}) {
  warnIgnoredOptions(options);
  const source = await resolveInput(input);
  const settings = resolveSettings(source.data, options);
  const doc = new PDFDocument({
    size: settings.format,
    layout: settings.landscape ? 'landscape' : 'portrait',
    margin: 0,
    bufferPages: true,
    autoFirstPage: true,
  });
  const done = pdfBuffer(doc);
  await registerPdfFonts(doc);

  let built;
  try {
    built = await buildBlocks(source.body, {
      doc,
      basedir: source.basedir,
      mermaid: settings.mermaid,
      contentWidth: settings.layoutWidth,
      pageHeight: settings.layoutHeight,
    });
  } finally {
    await closeDiagramRenderer();
  }
  const { blocks, warnings } = built;
  const title = settings.title || titleFrom(blocks, source.fallbackTitle);
  doc.info.Title = title;
  for (const warning of warnings) console.error(warning);

  composePdf(doc, blocks, settings);
  doc.end();
  const content = await done;

  if (options.dest) {
    const dest = path.resolve(options.dest);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content);
    return { filename: dest, content };
  }
  return { content };
}
