# 文字とフォント

[README](../README.md) > 文字とフォント

PDF にはフォントを埋め込むので、見る側の環境に日本語フォントがなくても同じように表示されます。

## 使うフォント

| 文字 | フォント | 入手元 |
| --- | --- | --- |
| 日本語・英数字 | Noto Sans JP（標準・太字） | npm の `@fontsource/noto-sans-jp` |
| JIS 第3・第4水準の漢字など（`𠮷` `髙` `﨑`） | Noto Sans JP の追加グリフ | 同上（文書で使う分だけ読み込み） |
| 矢印・図形・丸数字・罫線・欧文の記号 | DejaVu Sans の一部（MdSymbols） | `src/assets/fonts/` に同梱 |
| コード | DejaVu Sans Mono の一部（MdMono） | `src/assets/fonts/` に同梱 |
| 絵文字 | Noto Emoji（白黒） | npm の `@fontsource/noto-emoji`（文書で使う分だけ読み込み） |
| 数式 | KaTeX のフォント | npm の `katex`（画像にして埋め込み） |

追加のグリフと絵文字は、文書の中で使われている文字を調べ、その文字を含むファイルだけを読み込みます。そのため、使わない文字のぶん PDF が大きくなることはありません。

コードは等幅フォントで描くので、罫線（`├── │ └──`）やアスキーアートが縦にそろいます。等幅フォントにない文字（日本語など）は Noto Sans JP で描きます。

## 斜体

日本語のフォントには斜体がないので、字形を傾けて斜体にします。英字も日本語も同じように傾きます。

## 絵文字

絵文字は Noto Emoji の白黒の字形で描きます（PDF でカラーの絵文字を描くことはできません）。

| 絵文字 | PDF での扱い |
| --- | --- |
| `✅` `🚀` `🎉` などふつうの絵文字 | 白黒の字形 |
| `:smile:` などのショートコード | 絵文字に変えてから描きます |
| `🇯🇵` などの国旗 | `[JP]` のように国コードにします |
| `👨‍👩‍👧` などの組み合わせ絵文字 | 最初の1文字（`👨`）にします |
| `👍🏻` などの肌の色 | 肌の色を外します |
| `1️⃣` などのキーキャップ | `①` にします |

## 描けない文字の置き換え

フォントにない文字は、次の順で置き換えます。四角（□）の文字化けは出ません。

1. ゼロ幅スペース、BOM、絵文字の異体字セレクタなど、目に見えない文字は消します
2. `𝐀` → `A`、`㍿` → `株式会社` のような互換文字は、描けなければふつうの文字にします
3. アクセント記号の付いた文字が描けなければ、記号を外します
4. それでも描けない文字は `〓` にします（ハングル、タイ文字、アラビア文字など）

ハングルやタイ文字を PDF に入れたいときは、いまは対応していません。

## ライセンス

| フォント | ライセンス |
| --- | --- |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | SIL Open Font License 1.1 |
| [Noto Emoji](https://fonts.google.com/noto/specimen/Noto+Emoji) | SIL Open Font License 1.1 |
| [DejaVu Sans / DejaVu Sans Mono](https://dejavu-fonts.github.io/)（MdSymbols / MdMono として一部を同梱） | Bitstream Vera / DejaVu のライセンス（`src/assets/fonts/DEJAVU-LICENSE.txt`） |
| [KaTeX](https://katex.org/) のフォント | SIL Open Font License 1.1 |
