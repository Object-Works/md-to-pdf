# Library

[README](../README.en.md) > Library

md-to-pdf can be used from Node.js. It is ES Modules only and ships type definitions (`src/index.d.ts`).

```bash
npm install @object-works/md-to-pdf
```

## mdToPdf(input, options?)

Converts Markdown to PDF.

```javascript
import { writeFile } from 'node:fs/promises';
import { mdToPdf } from '@object-works/md-to-pdf';

// Convert a file and write the PDF
await mdToPdf('docs/spec.md', { dest: 'dist/spec.pdf' });

// Convert a string and get a Buffer
const { content } = await mdToPdf(
  { content: '# Title\n\n![figure](images/a.png)', basedir: '/path/to/docs' },
  { format: 'A5', pageBreak: '# ##' },
);
await writeFile('out.pdf', content);
```

### input

| Form | Meaning |
| --- | --- |
| `'path/to/doc.md'` | Path to a Markdown file |
| `{ path: 'path/to/doc.md' }` | Same as above |
| `{ content: '# …', basedir?: '…' }` | Markdown string. `basedir` is the base for relative image paths (default: current directory) |

When a file is given, its directory is the base for images, and its front matter is read.

### options

| Option | Type | Meaning | Default |
| --- | --- | --- | --- |
| `dest` | `string` | Path of the PDF to write. Without it nothing is written and only `content` is returned | none |
| `format` | `'A3' \| 'A4' \| 'A5' \| 'Letter' \| 'Legal'` | Paper size | `'A4'` |
| `landscape` | `boolean` | Landscape orientation | `false` |
| `margin` | `string \| { top, right, bottom, left }` | Margins, as a string like `'8mm 16mm'` or one string per side | `'16mm 16mm 18mm 16mm'` |
| `pageBreak` | `string \| number[]` | Heading levels that always start a new page: `'#'` `'# ##'` `'1,2'` `'none'` `[1, 2]` | `'#'` |
| `pageNumbers` | `boolean` | Print page numbers | `true` |
| `mermaid` | `boolean` | Render Mermaid diagrams and math. With `false`, no browser is started | `true` |
| `title` | `string` | Document title stored in the PDF | Front matter `title`, first `#` heading, then the file name (`document` for strings) |

`stylesheet`, `css` and `debugHtml` are accepted for compatibility with older versions but have no effect (a warning is printed).

Precedence: defaults < front matter < options.

### Return value

```typescript
interface MdToPdfResult {
  filename?: string; // absolute path of the written file when dest is set
  content: Buffer;   // the PDF
}
```

### Errors

The promise rejects with an `Error` describing the problem when, for example, the file does not exist or the paper size, margin or page-break value is invalid.

It does not reject when a Mermaid diagram or math cannot be rendered (syntax error, browser fails to start, …). A diagram is kept as code with a red error message in the PDF, math is kept as `$…$` text, a warning is printed to standard error, and conversion continues.

## renderMarkdown(markdown, options?)

Converts Markdown to an HTML string. This is a simple conversion separate from the PDF layout (Mermaid diagrams are emitted as `<figure class="diagram">` containing the source, not rendered).

```javascript
import { renderMarkdown } from '@object-works/md-to-pdf';

const html = renderMarkdown('# Title\n\nBody', { basedir: process.cwd(), mermaid: true });
```

| Option | Meaning |
| --- | --- |
| `basedir` | Base for turning relative image paths into `file://` URLs |
| `mermaid` | With `false`, Mermaid fences are emitted as ordinary code blocks |
