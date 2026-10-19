#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { mdToPdf } from './index.js';
import { parsePageBreak } from './options.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

function help() {
  return `md-to-pdf ${packageJson.version}
Markdown を PDF に変換します。Mermaid の図、表、コード、見出しに対応します。
小題は直後の内容と分かれないように、図はページの途中で切れないように組版します。

使い方:
  md-to-pdf <file.md> [file2.md ...] [options]

オプション:
  -o, --output <path>      出力 PDF。複数ファイルのときは出力ディレクトリ
  -f, --format <size>      用紙。A3, A4, A5, Letter, Legal（既定: A4）
      --landscape          横向き
      --margin <size>      余白。1〜4 値（上 右 下 左）
                           例: 16mm 、 18mm 16mm 、 16mm 16mm 18mm 16mm
                           既定: 16mm 16mm 18mm 16mm
      --page-break <levels>
                           必ず改ページする見出しのレベル（既定: "#"）
                           例: "#" 、 "# ##" 、 "# ## ###" 、 1,2 、 none
                           ほかの見出しは、はみ出るときだけ改ページ
      --css <file.css>     受け付けますが、ブラウザを使わないため反映しません
      --no-mermaid         Mermaid を描画せず、コードブロックのままにする
      --no-page-numbers    ページ番号を付けない
  -h, --help               このヘルプ
  -v, --version            バージョン

文書先頭の front matter でも title, format, margin, landscape, pageBreak を
指定できます。コマンドラインの指定が front matter より優先されます。

  ---
  title: 要件定義
  format: A4
  margin: 16mm
  pageBreak: "# ##"
  ---

ライブラリ:
  import { mdToPdf } from 'md-to-pdf';
  await mdToPdf('doc.md', { dest: 'doc.pdf' });
`;
}

function takeFlags(argv) {
  const flags = {};
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-mermaid') flags.mermaid = false;
    else if (arg === '--mermaid') flags.mermaid = true;
    else if (arg === '--no-page-numbers') flags.pageNumbers = false;
    else if (arg === '--page-numbers') flags.pageNumbers = true;
    else if (arg === '--debug-html') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--debug-html にはパスが必要です');
      flags.debugHtml = value;
      index += 1;
    } else rest.push(arg);
  }
  return { flags, rest };
}

async function outputPath(inputFile, output, multiple) {
  const base = `${path.basename(inputFile).replace(/\.markdown$|\.md$/i, '')}.pdf`;
  if (!output) {
    const resolved = path.resolve(inputFile);
    return path.join(path.dirname(resolved), base);
  }

  const resolvedOutput = path.resolve(output);
  let asDirectory = output.endsWith(path.sep) || output.endsWith('/');
  if (!asDirectory) {
    try {
      asDirectory = (await stat(resolvedOutput)).isDirectory();
    } catch {
      asDirectory = false;
    }
  }
  if (multiple && !asDirectory) {
    throw new Error('複数ファイルを変換するときは、--output にディレクトリを指定してください');
  }
  if (asDirectory) return path.join(resolvedOutput, base);
  return resolvedOutput;
}

async function main(argv) {
  const { flags, rest } = takeFlags(argv);
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      output: { type: 'string', short: 'o' },
      format: { type: 'string', short: 'f' },
      landscape: { type: 'boolean', default: false },
      margin: { type: 'string' },
      'page-break': { type: 'string' },
      css: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(help());
    return;
  }
  if (values.version) {
    console.log(packageJson.version);
    return;
  }
  if (positionals.length === 0) {
    console.log(help());
    throw new Error('変換する Markdown ファイルを指定してください');
  }

  const explicit = {};
  if (values.format) explicit.format = values.format;
  if (values.margin) explicit.margin = values.margin;
  if (values['page-break'] !== undefined) explicit.pageBreak = parsePageBreak(values['page-break']);
  if (values.landscape) explicit.landscape = true;
  if (values.css) explicit.stylesheet = path.resolve(values.css);
  if (flags.mermaid !== undefined) explicit.mermaid = flags.mermaid;
  if (flags.pageNumbers !== undefined) explicit.pageNumbers = flags.pageNumbers;
  if (flags.debugHtml) explicit.debugHtml = path.resolve(flags.debugHtml);

  for (const file of positionals) {
    const dest = await outputPath(file, values.output, positionals.length > 1);
    process.stderr.write(`変換中: ${file}\n`);
    await mdToPdf(file, { ...explicit, dest });
    console.log(dest);
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
