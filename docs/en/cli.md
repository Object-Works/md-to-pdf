# Command line

[README](../README.en.md) > Command line

```bash
md-to-pdf <file.md> [file2.md ...] [options]
```

## Options

| Option | Description | Default |
| --- | --- | --- |
| `-o, --output <path>` | Output PDF path. The output directory when converting several files | Same directory and name as the input, with `.pdf` |
| `-f, --format <size>` | Paper size: `A3` `A4` `A5` `Letter` `Legal` (case-insensitive) | `A4` |
| `--landscape` | Landscape orientation | Portrait |
| `--margin <size>` | Margins. See [Margins](#margins) | `16mm 16mm 18mm 16mm` |
| `--page-break <levels>` | Heading levels that always start a new page. See [Page breaks](layout.md#page-breaks---page-break) | `"#"` |
| `--no-mermaid` | Do not render Mermaid diagrams or math. Diagrams stay as code blocks, math stays as `$…$` text, and no browser is started | Render |
| `--no-page-numbers` | Do not print the page number (`3 / 12`) at the bottom right | Print |
| `--css <file>` | Accepted but ignored (the layout does not use a browser) | |
| `-h, --help` | Show help | |
| `-v, --version` | Show the version | |

## Output paths

- Without `-o`, the PDF is written next to the input with the extension changed to `.pdf` (`doc.md` → `doc.pdf`; `.markdown` works the same way)
- If `-o` is an existing directory or ends with `/`, the PDF is written into it with the same name
- When converting several files, pass a directory to `-o` (without `-o`, each PDF goes next to its input)
- Missing output directories are created
- The path of each written PDF goes to standard output; progress (`変換中: …`) and warnings go to standard error

```bash
md-to-pdf README.md                      # ./README.pdf
md-to-pdf docs/a.md -o out.pdf           # ./out.pdf
md-to-pdf docs/*.md -o dist/             # dist/a.pdf, dist/b.pdf, ...
```

On failure (missing file, invalid option, …) the reason is printed and the process exits with code 1.

## Margins

Write 1 to 4 values separated by spaces, in the same order as CSS `margin`. Units: `mm` `cm` `in` `px`. A number without a unit means `mm`.

| Value | Top | Right | Bottom | Left |
| --- | --- | --- | --- | --- |
| `16mm` | 16mm | 16mm | 16mm | 16mm |
| `8mm 16mm` | 8mm | 16mm | 8mm | 16mm |
| `8mm 16mm 12mm` | 8mm | 16mm | 12mm | 16mm |
| `8mm 16mm 12mm 20mm` | 8mm | 16mm | 12mm | 20mm |

Quote the value because it contains spaces.

```bash
md-to-pdf doc.md --margin "8mm 16mm"
```

Page numbers are drawn inside the bottom margin. If you make the bottom margin very small, consider `--no-page-numbers`.

## Front matter

Settings between `---` lines at the very top of a file apply to that document only.

```markdown
---
title: Requirements
format: A4
margin: 8mm 16mm
landscape: false
pageBreak: "# ##"
---

# Requirements
```

| Key | Meaning |
| --- | --- |
| `title` | Document title stored in the PDF (shown in the viewer's title bar). Defaults to the first `#` heading, then the file name |
| `format` | Same as `--format` |
| `margin` | Same as `--margin` |
| `landscape` | `true` for landscape |
| `pageBreak` (or `page-break`) | Same as `--page-break` |

- Precedence: defaults < front matter < command line
- Only simple one-line `key: value` pairs are read (no nested YAML)
- Front matter is not printed. A `---` that is not at the top of the file is a horizontal rule

## Large diagrams

Mermaid diagrams that do not fit on a page are scaled down to fit its width and height. When a diagram is scaled below 70%, a warning like this is printed:

```
注意: 図3 をページ内に収めるため 42% に縮小しました。読みにくい場合は --format A3 または --landscape を試してください。
```

("Diagram 3 was scaled to 42% to fit the page. Try --format A3 or --landscape if it is hard to read.")

Use `--landscape` for wide diagrams such as Gantt charts, and `--format A3` for diagrams that are large overall.
