const HELP_ARTICLE_HEADING_SELECTOR =
  '.help-center__article-body .help-center__body h3, .help-center__article-body .help-center__body h4';

export function getHelpArticleHeadings(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(HELP_ARTICLE_HEADING_SELECTOR));
}
