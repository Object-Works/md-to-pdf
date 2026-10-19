# md-to-pdf

日本語 | [English](README.en.md)

Markdown を PDF に変換するコマンドラインツールとライブラリです。日本語の文書を、見出しや図がページの途中で切れないように組版します。

ブラウザの印刷機能は使わず、[PDFKit](https://pdfkit.org/) で文字を1文字ずつ配置して PDF を作ります。ヘッドレス Chrome は Mermaid の図と数式を画像にするときだけ起動します。

```bash
npm install -g @object-works/md-to-pdf
md-to-pdf doc.md
```

## 特長

- **日本語の組版**: Noto Sans JP を同梱。行頭・行末の禁則を守り、改行だけでつないだ日本語の行は詰めてつなぎます
- **ページの途中で切らない**: 見出しは直後の内容と同じページに置き、図・コード・引用・表の行は分割しません。長い表は見出し行を次のページでも繰り返します
- **選べる改ページ**: `#` は必ず改ページ、`##` 以降ははみ出るときだけ、のように見出しのレベルごとに選べます
- **GitHub と同じ書き方**: 表（列の寄せ）、タスクリスト、脚注、アラート（`> [!NOTE]`）、絵文字のショートコード、取り消し線
- **図と数式**: [Mermaid](https://mermaid.js.org/) の図と、KaTeX の数式（`$E=mc^2$`）を描きます
- **Markdown の中の HTML**: `<p align="center">`、`<img width>`、`<table>`、`<details>` など、README でよく使う書き方
- **文字化けしない**: フォントにない文字は四角（□）にせず、近い文字か `〓` に置き換えます。絵文字は白黒の字形で描きます
- **クリックできるリンク**: 外部リンクも、文書内の `#見出し` へのリンクや脚注も、PDF 上でクリックできます

## インストール

Node.js 20 以上が必要です。

```bash
npm install -g @object-works/md-to-pdf
```

Mermaid の図と数式を描くためのブラウザ（chrome-headless-shell）は、インストールのときに Puppeteer が入れます。入らなかった場合は次のコマンドで入れてください。

```bash
npx puppeteer browsers install chrome-headless-shell
```

### 更新

```bash
npm install -g @object-works/md-to-pdf@latest
```

## 使い方

```bash
md-to-pdf doc.md                         # doc.pdf を同じ場所に書き出す
md-to-pdf doc.md -o dist/doc.pdf         # 出力先を指定
md-to-pdf chapters/*.md -o dist/         # 複数ファイルをまとめて変換
md-to-pdf doc.md --format A3 --landscape # A3 横向き
md-to-pdf doc.md --margin "8mm 16mm"     # 上下 8mm、左右 16mm
md-to-pdf doc.md --page-break "# ##"     # # と ## の前で必ず改ページ
```

| オプション | 説明 | 既定 |
| --- | --- | --- |
| `-o, --output <path>` | 出力 PDF。複数ファイルのときはディレクトリ | 入力と同じ場所・同じ名前 |
| `-f, --format <size>` | 用紙。`A3` `A4` `A5` `Letter` `Legal` | `A4` |
| `--landscape` | 横向き | 縦向き |
| `--margin <size>` | 余白。CSS と同じ1〜4個の値（上 右 下 左） | `16mm 16mm 18mm 16mm` |
| `--page-break <levels>` | 必ず改ページする見出しのレベル。`"#"` `"# ##"` `1,2` `none` など | `"#"` |
| `--no-mermaid` | Mermaid の図と数式を描かず、コード・文字のまま出す | 描く |
| `--no-page-numbers` | ページ番号を付けない | 付ける |
| `-h, --help` / `-v, --version` | ヘルプ / バージョン | |

文書の先頭の front matter でも設定できます。コマンドラインの指定が優先されます。

```markdown
---
title: 要件定義
format: A4
margin: 16mm
landscape: false
pageBreak: "# ##"
---
```

詳しくは [コマンドライン](ja/cli.md) を見てください。

## ライブラリとして使う

```javascript
import { mdToPdf } from '@object-works/md-to-pdf';

await mdToPdf('doc.md', { dest: 'doc.pdf' });

const { content } = await mdToPdf({ content: '# 題名\n\n本文' }, { format: 'A5' });
// content は PDF の Buffer
```

詳しくは [ライブラリ](ja/api.md) を見てください。

## ドキュメント

| ページ | 内容 |
| --- | --- |
| [コマンドライン](ja/cli.md) | オプション、front matter、出力先、余白の書き方 |
| [Markdown の書き方](ja/markdown.md) | 対応している書き方の一覧、Mermaid、数式、HTML |
| [組版と改ページ](ja/layout.md) | ページの途中で切らない仕組み、`--page-break`、表と図の扱い |
| [文字とフォント](ja/fonts.md) | 同梱フォント、絵文字、描けない文字の置き換え |
| [ライブラリ](ja/api.md) | `mdToPdf` の引数・戻り値・オプション |
| [困ったとき](ja/troubleshooting.md) | ブラウザが起動しない、図が小さい、`〓` が出る など |
| [開発](ja/development.md) | ディレクトリ構成、テスト、変換の流れ |

## フォントのライセンス

同梱・利用しているフォント（Noto Sans JP、Noto Emoji、DejaVu）のライセンスは [文字とフォント](ja/fonts.md#ライセンス) にまとめています。
