# ライブラリ

[README](../README.md) > ライブラリ

Node.js のプログラムから使えます。ES Modules のみで、型定義（`src/index.d.ts`）が付いています。

```bash
npm install @object-works/md-to-pdf
```

## mdToPdf(input, options?)

Markdown を PDF に変換します。

```javascript
import { writeFile } from 'node:fs/promises';
import { mdToPdf } from '@object-works/md-to-pdf';

// ファイルを変換して書き出す
await mdToPdf('docs/spec.md', { dest: 'dist/spec.pdf' });

// 文字列を変換して Buffer を受け取る
const { content } = await mdToPdf(
  { content: '# 題名\n\n![図](images/a.png)', basedir: '/path/to/docs' },
  { format: 'A5', pageBreak: '# ##' },
);
await writeFile('out.pdf', content);
```

### input

| 形 | 内容 |
| --- | --- |
| `'path/to/doc.md'` | Markdown ファイルのパス |
| `{ path: 'path/to/doc.md' }` | 同上 |
| `{ content: '# …', basedir?: '…' }` | Markdown の文字列。`basedir` は画像の相対パスの基準（既定はカレントディレクトリ） |

ファイルを渡したときは、そのファイルのあるディレクトリが画像の基準になります。front matter も読みます。

### options

| オプション | 型 | 内容 | 既定 |
| --- | --- | --- | --- |
| `dest` | `string` | 書き出す PDF のパス。省略するとファイルに書かず、戻り値の `content` だけを返します | なし |
| `format` | `'A3' \| 'A4' \| 'A5' \| 'Letter' \| 'Legal'` | 用紙 | `'A4'` |
| `landscape` | `boolean` | 横向き | `false` |
| `margin` | `string \| { top, right, bottom, left }` | 余白。`'8mm 16mm'` のような文字列か、各辺を文字列で | `'16mm 16mm 18mm 16mm'` |
| `pageBreak` | `string \| number[]` | 必ず改ページする見出しのレベル。`'#'` `'# ##'` `'1,2'` `'none'` `[1, 2]` | `'#'` |
| `pageNumbers` | `boolean` | ページ番号を付ける | `true` |
| `mermaid` | `boolean` | Mermaid の図と数式を描く。`false` ならブラウザを起動しません | `true` |
| `title` | `string` | PDF の文書タイトル | front matter の `title`、最初の `#` 見出し、ファイル名（文字列のときは `document`）の順 |

`stylesheet` `css` `debugHtml` は以前の版との互換のために受け付けますが、反映しません（指定すると注意を表示します）。

優先順位は「既定値 < front matter < options」です。

### 戻り値

```typescript
interface MdToPdfResult {
  filename?: string; // dest を指定したとき、書き出したファイルの絶対パス
  content: Buffer;   // PDF の中身
}
```

### エラー

ファイルがない、用紙・余白・改ページの指定が不正などのときは、理由を書いた `Error` で reject します。

Mermaid の図や数式が描けないとき（書き間違い、ブラウザが起動できないなど）は reject しません。図は PDF の中に赤字でエラーを出してコードのまま、数式は `$…$` の文字のまま残し、標準エラー出力に注意を表示して変換を続けます。

## renderMarkdown(markdown, options?)

Markdown を HTML の文字列にします。PDF の組版とは別の、簡易な変換です（Mermaid の図は `<figure class="diagram">` にソースを入れるだけで、描画しません）。

```javascript
import { renderMarkdown } from '@object-works/md-to-pdf';

const html = renderMarkdown('# 題名\n\n本文', { basedir: process.cwd(), mermaid: true });
```

| オプション | 内容 |
| --- | --- |
| `basedir` | 画像の相対パスを `file://` の URL に変えるときの基準 |
| `mermaid` | `false` にすると Mermaid をふつうのコードブロックとして出します |
