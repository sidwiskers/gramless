export interface RenderMiniAppHtmlOptions {
  title?: string;
  body?: string;
  styles?: string;
  scripts?: string;
  includeTelegramScript?: boolean;
}

export function getTelegramThemeCss(): string;
export function renderMiniAppHtml(options?: RenderMiniAppHtmlOptions): string;
export default renderMiniAppHtml;
