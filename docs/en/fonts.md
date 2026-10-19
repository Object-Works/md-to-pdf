# Characters and fonts

[README](../README.en.md) > Characters and fonts

Fonts are embedded in the PDF, so it looks the same even on machines without Japanese fonts.

## Fonts used

| Characters | Font | Source |
| --- | --- | --- |
| Japanese, Latin letters, digits | Noto Sans JP (regular and bold) | npm `@fontsource/noto-sans-jp` |
| Rare kanji such as JIS level 3/4 (`𠮷` `髙` `﨑`) | Extra Noto Sans JP glyphs | Same (loaded only for characters in the document) |
| Arrows, shapes, circled numbers, box drawing, Latin symbols | Subset of DejaVu Sans (MdSymbols) | Bundled in `src/assets/fonts/` |
| Code | Subset of DejaVu Sans Mono (MdMono) | Bundled in `src/assets/fonts/` |
| Emoji | Noto Emoji (monochrome) | npm `@fontsource/noto-emoji` (loaded only for characters in the document) |
| Math | KaTeX fonts | npm `katex` (embedded as images) |

Extra glyphs and emoji are loaded per document: the characters it uses are checked and only the font files containing them are read. Characters you do not use never make the PDF bigger.

Code uses a monospace font, so box drawing (`├── │ └──`) and ASCII art line up. Characters missing from the monospace font (such as Japanese) are drawn with Noto Sans JP.

## Italic

Japanese fonts have no italic style, so italic is produced by slanting the glyphs. Latin and Japanese text are slanted the same way.

## Emoji

Emoji are drawn with Noto Emoji's monochrome glyphs (PDF cannot render color emoji fonts).

| Emoji | In the PDF |
| --- | --- |
| Regular emoji such as `✅` `🚀` `🎉` | Monochrome glyph |
| Shortcodes such as `:smile:` | Converted to the emoji, then drawn |
| Flags such as `🇯🇵` | Country code like `[JP]` |
| Combined emoji such as `👨‍👩‍👧` | First character only (`👨`) |
| Skin tones such as `👍🏻` | Skin tone removed |
| Keycaps such as `1️⃣` | `①` |

## Replacing characters that cannot be drawn

Characters missing from the fonts are replaced in this order, so no empty boxes (□) appear:

1. Invisible characters such as zero-width spaces, BOMs and emoji variation selectors are removed
2. Compatibility characters such as `𝐀` → `A` or `㍿` → `株式会社` are normalized when they cannot be drawn as-is
3. Accented characters that cannot be drawn lose their accent marks
4. Anything still not drawable becomes `〓` (Hangul, Thai, Arabic, …)

Hangul and Thai are not supported at the moment.

## Licenses

| Font | License |
| --- | --- |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | SIL Open Font License 1.1 |
| [Noto Emoji](https://fonts.google.com/noto/specimen/Noto+Emoji) | SIL Open Font License 1.1 |
| [DejaVu Sans / DejaVu Sans Mono](https://dejavu-fonts.github.io/) (subsets bundled as MdSymbols / MdMono) | Bitstream Vera / DejaVu license (`src/assets/fonts/DEJAVU-LICENSE.txt`) |
| [KaTeX](https://katex.org/) fonts | SIL Open Font License 1.1 |
