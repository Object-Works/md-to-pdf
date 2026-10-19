# md-to-pdf

[日本語](README.md) | English

A command-line tool and library that converts Markdown to PDF. It lays out documents (especially Japanese ones) so that headings and diagrams never get split across pages.

It does not use a browser's print feature. Instead, it places every character itself with [PDFKit](https://pdfkit.org/). Headless Chrome is started only to turn Mermaid diagrams and math into images.

```bash
npm install -g @object-works/md-to-pdf
md-to-pdf doc.md
```

## Highlights

- **Japanese typesetting**: Noto Sans JP is bundled. Line-breaking rules (kinsoku) are respected, and Japanese lines joined by a plain newline are joined without a space
- **No awkward page splits**: headings stay on the same page as the content that follows, and diagrams, code blocks, quotes and table rows are never split. Long tables repeat their header row on every page
- **Configurable page breaks**: choose per heading level, e.g. always break before `#`, break before `##` and below only when they would overflow
- **GitHub-flavored syntax**: tables (column alignment), task lists, footnotes, alerts (`> [!NOTE]`), emoji shortcodes, strikethrough
- **Diagrams and math**: [Mermaid](https://mermaid.js.org/) diagrams and KaTeX math (`$E=mc^2$`)
- **HTML inside Markdown**: `<p align="center">`, `<img width>`, `<table>`, `<details>` and other patterns common in READMEs
- **No tofu**: characters missing from the fonts are replaced with a close equivalent or `〓` instead of empty boxes (□). Emoji are drawn as monochrome glyphs
- **Clickable links**: external links, in-document `#heading` links and footnotes are all clickable in the PDF

## Installation

Requires Node.js 20 or later.

```bash
npm install -g @object-works/md-to-pdf
```

Puppeteer installs the browser used for Mermaid and math (chrome-headless-shell) during installation. If it is missing, install it with:

```bash
npx puppeteer browsers install chrome-headless-shell
```

### Update

```bash
npm install -g @object-works/md-to-pdf@latest
```

## Usage

```bash
md-to-pdf doc.md                         # writes doc.pdf next to doc.md
md-to-pdf doc.md -o dist/doc.pdf         # choose the output file
md-to-pdf chapters/*.md -o dist/         # convert several files at once
md-to-pdf doc.md --format A3 --landscape # A3, landscape
md-to-pdf doc.md --margin "8mm 16mm"     # 8mm top/bottom, 16mm left/right
md-to-pdf doc.md --page-break "# ##"     # always break before # and ##
```

| Option | Description | Default |
| --- | --- | --- |
| `-o, --output <path>` | Output PDF. A directory when converting several files | Same place and name as the input |
| `-f, --format <size>` | Paper size: `A3` `A4` `A5` `Letter` `Legal` | `A4` |
| `--landscape` | Landscape orientation | Portrait |
| `--margin <size>` | Margins, 1–4 values like CSS (top right bottom left) | `16mm 16mm 18mm 16mm` |
| `--page-break <levels>` | Heading levels that always start a new page: `"#"` `"# ##"` `1,2` `none` … | `"#"` |
| `--no-mermaid` | Do not render Mermaid diagrams or math; keep them as code/text | Render |
| `--no-page-numbers` | Do not print page numbers | Print |
| `-h, --help` / `-v, --version` | Help / version | |

Settings can also be written in front matter at the top of the document. Command-line options take precedence.

```markdown
---
title: Requirements
format: A4
margin: 16mm
landscape: false
pageBreak: "# ##"
---
```

See [Command line](en/cli.md) for details.

## Using it as a library

```javascript
import { mdToPdf } from '@object-works/md-to-pdf';

await mdToPdf('doc.md', { dest: 'doc.pdf' });

const { content } = await mdToPdf({ content: '# Title\n\nBody' }, { format: 'A5' });
// content is a Buffer holding the PDF
```

See [Library](en/api.md) for details.

## Documentation

| Page | Contents |
| --- | --- |
| [Command line](en/cli.md) | Options, front matter, output paths, margins |
| [Markdown syntax](en/markdown.md) | Supported syntax, Mermaid, math, HTML |
| [Layout and page breaks](en/layout.md) | How splits are avoided, `--page-break`, tables and diagrams |
| [Characters and fonts](en/fonts.md) | Bundled fonts, emoji, replacement of missing characters |
| [Library](en/api.md) | `mdToPdf` arguments, return value and options |
| [Troubleshooting](en/troubleshooting.md) | Browser won't start, tiny diagrams, `〓` in the output … |
| [Development](en/development.md) | Directory structure, tests, conversion pipeline |

## Font licenses

The licenses of the bundled and used fonts (Noto Sans JP, Noto Emoji, DejaVu) are listed in [Characters and fonts](en/fonts.md#licenses).
