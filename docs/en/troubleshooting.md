# Troubleshooting

[README](../README.en.md) > Troubleshooting

## Diagrams are not drawn; a red error and the code appear instead

```
⚠ Mermaid 図1 を描画できませんでした: Mermaid 図や数式を描くためのブラウザを起動できませんでした: …
```

("Could not render Mermaid diagram 1: could not start the browser used for diagrams and math")

Mermaid diagrams and math are rendered in headless Chrome started by Puppeteer. If the browser is missing, install it:

```bash
npx puppeteer browsers install chrome-headless-shell
```

If a sandbox error occurs (common in Docker or CI), the browser is restarted automatically with `--no-sandbox`. If it still fails, check that the libraries Chrome needs (such as `libnss3`) are installed. If you need neither diagrams nor math, `--no-mermaid` skips the browser entirely.

## The diagram error says `Parse error`

The Mermaid syntax is wrong. Use the line number in the message (`line 3`, …) to fix it. Pasting the diagram into the [Mermaid Live Editor](https://mermaid.live/) makes the mistake easy to find. The rest of the document is still converted.

## A diagram is too small to read

Diagrams that do not fit on a page are scaled down. Below 70%, a warning is printed:

```
注意: 図6 をページ内に収めるため 42% に縮小しました。
```

- For wide diagrams (Gantt charts, `flowchart LR` with many nodes) use `--landscape`
- For diagrams that are large overall use `--format A3`
- If possible, split the diagram into two

## `〓` appears in the PDF

The character is not in any of the fonts. Hangul, Thai, Arabic and similar scripts are not supported. See [Characters and fonts](fonts.md#replacing-characters-that-cannot-be-drawn) for which characters are replaced.

## An image shows as `［画像: …］`

- Check that the path is relative to the Markdown file (when passing a string to the library, set `basedir`)
- `http(s)://` images are not downloaded. Save them locally and use a relative path
- SVG and GIF are not supported. Use PNG or JPEG

## Page breaks are not where I expected

- To stop forcing a break before `#`, use `--page-break none`
- To start every `##` on a new page, use `--page-break "# ##"`
- If the content right after a heading is long, the heading may move to the next page together with it. See [Layout and page breaks](layout.md) for the rules

## List numbering continues from a previous list

A blank line alone does not end a list (CommonMark rule). Put `<!-- -->` between the two lists.

## `--css` has no effect

The layout does not use a browser, so CSS is not applied. Set paper size, margins and page breaks with options.
