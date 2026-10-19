export interface MdToPdfMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface MdToPdfOptions {
  dest?: string;
  format?: 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';
  landscape?: boolean;
  margin?: string | MdToPdfMargin;
  /** ブラウザ組版をやめたため、指定しても反映されません */
  stylesheet?: string;
  /** ブラウザ組版をやめたため、指定しても反映されません */
  css?: string;
  pageNumbers?: boolean;
  mermaid?: boolean;
  /** 必ず改ページする見出しのレベル。'#'、'# ##'、'1,2'、'none'、[1, 2] など（既定: '#'） */
  pageBreak?: string | number[];
  title?: string;
  /** ブラウザ組版をやめたため、指定しても反映されません */
  debugHtml?: string;
}

export interface MdToPdfResult {
  filename?: string;
  content: Buffer;
}

export interface MdToPdfContentInput {
  content: string;
  basedir?: string;
}

export function mdToPdf(
  input: string | { path: string } | MdToPdfContentInput,
  options?: MdToPdfOptions,
): Promise<MdToPdfResult>;

export function renderMarkdown(
  markdown: string,
  options?: { basedir?: string; mermaid?: boolean },
): string;
