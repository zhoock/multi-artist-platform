import type { ArticledetailsProps, IArticles } from '@models';
import {
  markdownToRichText,
  richTextToMarkdown,
  richTextToPlainText,
  splitRichTextAt,
} from '@shared/lib/richText';

const DEFAULT_PREVIEW_PLAIN_LIMIT = 150;

export type ArticlePreviewContent = {
  markdown: string;
  truncated: boolean;
};

function shouldSkipPreviewBlock(detail: ArticledetailsProps): boolean {
  if (detail.type === 'image' || detail.type === 'carousel') return true;
  if (
    detail.blockKind === 'title' ||
    detail.blockKind === 'subtitle' ||
    detail.blockKind === 'divider' ||
    detail.blockKind === 'image' ||
    detail.blockKind === 'carousel'
  ) {
    return true;
  }
  if (detail.title?.trim() || detail.subtitle?.trim()) return true;
  if (detail.content === '---') return true;
  return false;
}

function markdownPartsFromDetail(detail: ArticledetailsProps): string[] {
  if (shouldSkipPreviewBlock(detail)) return [];

  if (typeof detail.content === 'string') {
    const trimmed = detail.content.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(detail.content)) {
    return detail.content
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && 'text' in item) {
          return String(item.text ?? '').trim();
        }
        return '';
      })
      .filter((part) => part.length > 0);
  }

  return [];
}

function truncateMarkdownPreview(markdown: string, maxPlainLength: number): ArticlePreviewContent {
  const rich = markdownToRichText(markdown);
  const plain = richTextToPlainText(rich);
  if (plain.length <= maxPlainLength) {
    return { markdown, truncated: false };
  }

  let cutAt = maxPlainLength;
  const head = plain.slice(0, maxPlainLength);
  const lastSpace = head.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxPlainLength * 0.65)) {
    cutAt = lastSpace;
  }

  const [before] = splitRichTextAt(rich, cutAt);
  return {
    markdown: richTextToMarkdown(before).trim(),
    truncated: true,
  };
}

/** First ~150 plain chars of article body as markdown for formatted dashboard preview. */
export function getArticlePreviewContent(
  article: IArticles,
  maxPlainLength = DEFAULT_PREVIEW_PLAIN_LIMIT
): ArticlePreviewContent | null {
  if (!article.details || !Array.isArray(article.details)) {
    return null;
  }

  const parts: string[] = [];

  for (const detail of article.details) {
    if (!detail) continue;
    parts.push(...markdownPartsFromDetail(detail));

    const combined = parts.join(' ');
    const plainLen = richTextToPlainText(markdownToRichText(combined)).length;
    if (plainLen >= maxPlainLength) {
      break;
    }
  }

  const markdown = parts.join(' ').trim();
  if (!markdown) {
    return null;
  }

  return truncateMarkdownPreview(markdown, maxPlainLength);
}
