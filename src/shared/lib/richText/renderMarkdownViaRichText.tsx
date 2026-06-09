// src/shared/lib/richText/renderMarkdownViaRichText.tsx
import type { ReactNode } from 'react';

import { markdownToRichText } from './markdownAdapter';
import { renderRichText } from './renderRichText';

/**
 * Runtime bridge: legacy markdown string → RichText pipeline → ReactNode.
 *
 * Единственная композиция markdownToRichText + renderRichText. Никакой
 * дополнительной логики — готов к подстановке вместо renderInlineMarkdown()
 * в ArticlePage одним коммитом после закрытия by-design parity gaps.
 */
export function renderMarkdownViaRichText(markdown: string | null | undefined): ReactNode {
  return renderRichText(markdownToRichText(markdown));
}
