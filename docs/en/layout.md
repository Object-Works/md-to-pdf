# Layout and page breaks

[README](../README.en.md) > Layout and page breaks

md-to-pdf paginates documents itself instead of using a browser's print feature. The goal is that a reader turning a page never finds a heading, or half a diagram, left behind at the bottom of the previous page.

## Basic idea

The document is first split into blocks (paragraphs, headings, diagrams, code, table rows, …). Each block is measured, then the blocks are placed onto pages from top to bottom.

- Paragraphs wrap line by line. A paragraph that does not fit in the remaining space moves to the next page as a whole
- Diagrams, code and quotes that fit on one page, and individual table rows, are never split
- Code longer than a page is split per page; a quote longer than a page is laid out as its contents
- Long tables break only between rows and repeat the header row at the top of the next page

## Keeping headings with their content

A heading is always placed on the same page as the content that follows it.

1. If the section (from the heading to the next heading of the same or higher level) fits in the remaining space, it is placed as a whole
2. If it does not fit there but fits on one page, the whole section moves to the next page
3. A section longer than a page keeps only the heading and its first block (paragraph, first table row, diagram, …) together; the rest flows normally

Consecutive headings (e.g. `###` right after `##`) are treated as one unit.

## Diagrams right after a heading

When a diagram directly follows a heading, it is scaled down by the heading's height so both fit on one page. If that would make the diagram shorter than 60% of the page, it is not reduced and may use the full page height instead.

## Page breaks (`--page-break`)

Choose before which heading levels a new page always starts. Other headings break only when they would overflow, following the rules above.

| Value | Always break | Break only on overflow |
| --- | --- | --- |
| `"#"` (default) | `#` | `##` and below |
| `"# ##"` | `#` `##` | `###` and below |
| `"# ## ###"` | `#` `##` `###` | `####` and below |
| `none` | none | all headings |

```bash
md-to-pdf doc.md --page-break "# ##"
md-to-pdf doc.md --page-break 1,2      # same as above
md-to-pdf doc.md --page-break "h1 h2"  # same as above
md-to-pdf doc.md --page-break none
```

In front matter use `pageBreak: "# ##"`; in the library use `pageBreak: '# ##'` or `pageBreak: [1, 2]`.

- Use `#` marks or numbers (`1,2`, `h1 h2`). Quote the value because it contains `#`. `none`, `off` and `0` mean "no forced breaks"
- There is never a break before the first heading of the document
- Consecutive headings (e.g. `##` right after `#`) stay together on one page even if both levels are selected. Horizontal rules (`---`) between them are ignored
- A horizontal rule right before a forced break is not drawn, since it would duplicate the break
- HTML `<h1>`–`<h6>` count as headings too

If you use `#` for the document title and `##` for chapters, `"# ##"` starts every chapter on a new page.

## Page appearance

| Item | Value |
| --- | --- |
| Body text | Noto Sans JP 10.5pt, line height 1.75 |
| Headings | `#` 22pt, `##` 16pt, `###` 13pt, others 11.5pt (bold) |
| Code | Monospace 8.5pt, line height 1.5, gray background |
| Tables | 8.75pt (8pt or 7.5pt for tables with many columns) |
| Page numbers | Bottom right as `3 / 12` (disable with `--no-page-numbers`) |
| Margins | `16mm 16mm 18mm 16mm` (top right bottom left; change with `--margin`) |

## Line breaking

- Japanese breaks between characters, English between words. Very long words and URLs are broken where needed
- Characters that must not start a line (`、` `。` `」` `）` `!` `?` …) or end a line (`「` `（` …) are moved together with their neighbor
- Lines joined by a plain newline are joined without a space between Japanese characters and with a space in English
