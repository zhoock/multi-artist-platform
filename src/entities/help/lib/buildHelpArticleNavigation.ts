import type { HelpArticle, HelpContentBlock } from '../model/types';

export type HelpArticleNavItem = {
  id: string;
  text: string;
  level: 1 | 2;
};

function createAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function buildHelpArticleNavigation(article: HelpArticle | null): HelpArticleNavItem[] {
  if (!article) return [];

  const nav: HelpArticleNavItem[] = [];
  article.blocks.forEach((block: HelpContentBlock) => {
    if (block.subtitle) {
      nav.push({ id: createAnchor(block.subtitle), text: block.subtitle, level: 1 });
    }
    if (block.title) {
      nav.push({ id: createAnchor(block.title), text: block.title, level: 2 });
    }
  });
  return nav;
}

export { createAnchor as createHelpContentAnchor };
