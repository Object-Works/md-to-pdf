# md-to-pdf

Markdown を PDF に変換するコマンドラインツールです。`npm install -g` でインストールできます。

対応しているもの:

- 見出し、表、引用、リスト、コード（シンタックスハイライト）
- [Mermaid](https://mermaid.js.org/) の図（フローチャート、シーケンス図など）
- 日本語（Noto Sans JP を同梱）
- 見出しのレベルごとに選べる改ページ（`#` は必ず改ページ、`##` 以降ははみ出るときだけ、など）
- 図・コード・引用・表の行がページの途中で切れない組版。1ページに収まらない図は、縮小して1ページに収めます

## インストール

```bash
npm install -g @object-works/md-to-pdf
```

Mermaid の図は、Puppeteer が起動するヘッドレス Chrome 上の Mermaid.js で描き、画像として PDF に埋め込みます。ブラウザは `npm install` のときに Puppeteer が入れます。入っていない場合は `npx puppeteer browsers install chrome-headless-shell` で入れてください。図がない文書と `--no-mermaid` のときは、ブラウザを起動しません。

## 使い方

```bash
md-to-pdf doc.md -o dist/doc.pdf
md-to-pdf chapters/*.md -o dist/
md-to-pdf doc.md --format A3 --landscape
```

出力先を省略すると、入力と同じ場所に同じ名前の `.pdf` を書き出します。

```bash
md-to-pdf --help
```

### オプション

| オプション | 説明 |
| --- | --- |
| `-o, --output` | 出力 PDF。複数ファイルのときはディレクトリ |
| `-f, --format` | `A3` `A4` `A5` `Letter` `Legal`（既定は A4） |
| `--landscape` | 横向き |
| `--margin` | 余白。`16mm`、`18mm 16mm`、`16mm 16mm 18mm 16mm`（上 右 下 左） |
| `--page-break` | 必ず改ページする見出しのレベル。`"#"`（既定）、`"# ##"`、`"# ## ###"`、`none` など。詳しくは[改ページ](#改ページ) |
| `--no-mermaid` | Mermaid を描かず、コードのまま出す |
| `--no-page-numbers` | ページ番号を付けない |

用紙いっぱいに広がる図は、ページ幅と高さに収まるよう縮小します。縮小率が 70% を下回ると、その旨を表示します。その場合は `--format A3` か `--landscape` を試してください。

### Front matter

ファイルの先頭で、その文書だけの設定を書けます。コマンドラインの指定が優先されます。

```markdown
---
title: 要件定義
format: A4
margin: 16mm
landscape: false
pageBreak: "# ##"
---
```

### 改ページ

`--page-break` で、どの見出しの前で必ず改ページするかを選べます。選ばなかった見出しは、ページからはみ出るときだけ改ページします。

| 指定 | 必ず改ページ | はみ出るときだけ改ページ |
| --- | --- | --- |
| `"#"`（既定） | `#` | `##` 以降 |
| `"# ##"` | `#` `##` | `###` 以降 |
| `"# ## ###"` | `#` `##` `###` | `####` 以降 |
| `none` | なし | すべての見出し |

```bash
md-to-pdf doc.md --page-break "# ##"
md-to-pdf doc.md --page-break 1,2      # 上と同じ
md-to-pdf doc.md --page-break none
```

- `#` の数（`"# ##"`）でも、数字（`1,2`、`h1 h2`）でも書けます。`#` を含むので引用符で囲んでください
- 見出しが続くとき（`#` の直後に `##` など）は、まとめて同じページに置きます。間の区切り線（`---`）は無視します
- 改ページする見出しの直前にある区切り線（`---`）は、改ページと重なるので描きません
- 文書の最初の見出しの前では改ページしません
- 「はみ出るとき」とは、見出しのあとの内容が残りのスペースに入らず、見出しだけがページの下に取り残される場合です。節がまるごと1ページに収まるなら節ごと、収まらないなら見出しと最初の段落・表・図を次のページへ送ります

### Mermaid

フェンスの言語名を `mermaid` にします。

````markdown
```mermaid
flowchart LR
  A[依頼] --> B[配車]
  B --> C[配送]
```
````

図の中の `<br>` や `<b>` も、その Markdown を自分のマシンで PDF にする前提で描画します。

## ライブラリ

```javascript
import { mdToPdf } from 'md-to-pdf';

const pdf = await mdToPdf('doc.md', { dest: 'doc.pdf' });
// pdf.content は Buffer

await mdToPdf(
  { content: '# 題名\n\n本文', basedir: process.cwd() },
  { dest: 'out.pdf', format: 'A4', pageBreak: '# ##' },
);
```

## 組版

- 見出しの直後にある段落・図・短い節は、まとめて1ページに収まるときページをまたぎません
- 長い節は、見出しと最初の塊だけをくっつけ、残りは次のページへ送ります
- 図、収まる大きさのコードと引用、表の各行はページの途中で分割しません
- 長い表は行のあいだでのみ改ページし、見出し行を次のページでも繰り返します
- `--page-break` で選んだ見出し（既定は `#`）は、必ず新しいページから始めます
- 見出しの直後の図は、見出しと同じページに収まる大きさに縮小します

日本語の字形は [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)（SIL Open Font License）です。矢印・図形・丸数字など、このフォントに含まれない記号は同梱の記号フォント（DejaVu の一部。ライセンスは `src/fonts/DEJAVU-LICENSE.txt`）で描きます。
