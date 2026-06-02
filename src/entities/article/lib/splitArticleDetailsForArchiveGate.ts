import type { ArticledetailsProps } from '@models';

const SHORT_TEXT_MAX_CHARS = 180;
const SHORT_LIST_MAX_ITEMS = 2;

function blockHasHeroMedia(block: ArticledetailsProps): boolean {
  if (block.images && Array.isArray(block.images) && block.images.length > 0) {
    return true;
  }
  if (typeof block.img === 'string' && block.img.length > 0) {
    return true;
  }
  if (Array.isArray(block.img) && block.img.length > 0) {
    return true;
  }
  return false;
}

function blockHasReadableText(block: ArticledetailsProps): boolean {
  if (typeof block.content === 'string') {
    const trimmed = block.content.trim();
    return trimmed.length > 0 && trimmed !== '---';
  }
  if (Array.isArray(block.content)) {
    return block.content.some((item) => {
      const text = typeof item === 'string' ? item : item.text;
      return typeof text === 'string' && text.trim().length > 0;
    });
  }
  return false;
}

function readableTextLength(block: ArticledetailsProps): number {
  if (typeof block.content === 'string') {
    return block.content.trim().length;
  }
  if (Array.isArray(block.content)) {
    return block.content.reduce((total, item) => {
      const text = typeof item === 'string' ? item : item.text;
      return total + (typeof text === 'string' ? text.trim().length : 0);
    }, 0);
  }
  return 0;
}

function isShortTextBlock(block: ArticledetailsProps): boolean {
  if (!blockHasReadableText(block)) return false;
  if (Array.isArray(block.content) && block.content.length > SHORT_LIST_MAX_ITEMS) {
    return false;
  }
  return readableTextLength(block) <= SHORT_TEXT_MAX_CHARS;
}

function findFirstParagraphIndex(details: ArticledetailsProps[]): number {
  return details.findIndex(blockHasReadableText);
}

function findFirstImageIndex(details: ArticledetailsProps[]): number {
  return details.findIndex(blockHasHeroMedia);
}

function tryAddExtraShortTextBlock(
  details: ArticledetailsProps[],
  previewIndices: Set<number>
): void {
  const anchorIndex = Math.max(...previewIndices);
  const remainingContentCount = details
    .slice(anchorIndex + 1)
    .filter((block) => blockHasReadableText(block) || blockHasHeroMedia(block)).length;

  if (remainingContentCount < 2) {
    return;
  }

  for (let i = anchorIndex + 1; i < details.length; i += 1) {
    if (blockHasReadableText(details[i]) && isShortTextBlock(details[i])) {
      previewIndices.add(i);
      return;
    }
    if (blockHasReadableText(details[i]) || blockHasHeroMedia(details[i])) {
      return;
    }
  }
}

export type ArticleDetailsArchiveSplit = {
  /** Free preview blocks shown above the gate (structure-based, not height-based). */
  previewDetails: ArticledetailsProps[];
  /** Remaining blocks, rendered below the gate with a visual lock. */
  lockedDetails: ArticledetailsProps[];
};

/**
 * Splits article body for paywall:
 * first text block + first image (if in a different block) + at most one extra short text.
 * Section headings and other structural blocks stay locked.
 */
export function splitArticleDetailsForArchiveGate(
  details: ArticledetailsProps[]
): ArticleDetailsArchiveSplit {
  if (!Array.isArray(details) || details.length === 0) {
    return { previewDetails: [], lockedDetails: [] };
  }

  const firstTextIndex = findFirstParagraphIndex(details);
  const firstImageIndex = findFirstImageIndex(details);
  const previewIndices = new Set<number>();

  if (firstTextIndex < 0 && firstImageIndex < 0) {
    return { previewDetails: [], lockedDetails: details };
  }

  if (firstTextIndex >= 0) {
    previewIndices.add(firstTextIndex);
  }
  if (firstImageIndex >= 0 && firstImageIndex !== firstTextIndex) {
    previewIndices.add(firstImageIndex);
  }

  const lockedCount = details.length - previewIndices.size;
  if (lockedCount >= 2) {
    tryAddExtraShortTextBlock(details, previewIndices);
  }

  const sortedPreviewIndices = [...previewIndices].sort((a, b) => a - b);

  return {
    previewDetails: sortedPreviewIndices.map((index) => details[index]),
    lockedDetails: details.filter((_, index) => !previewIndices.has(index)),
  };
}

/** Blocks rendered in the blurred section below the archive gate. */
export function resolveLockedArticleBodyBlocks(
  details: ArticledetailsProps[],
  split: ArticleDetailsArchiveSplit
): ArticledetailsProps[] {
  if (split.lockedDetails.length > 0) {
    return split.lockedDetails;
  }
  if (split.previewDetails.length === 0 && details.length > 0) {
    return details;
  }
  return [];
}

export type ArticleLockedBodySize = 'compact' | 'medium' | 'tall';

export function resolveArticleLockedBodySize(
  blocks: ArticledetailsProps[],
  descriptionLength = 0
): ArticleLockedBodySize {
  const blockScore = blocks.reduce((score, block) => {
    if (blockHasHeroMedia(block)) return score + 3;
    if (Array.isArray(block.content)) return score + block.content.length;
    if (typeof block.content === 'string' && block.content.length > 0) return score + 2;
    if (block.title || block.subtitle) return score + 1;
    return score;
  }, 0);

  if (blockScore >= 10 || descriptionLength > 400) return 'tall';
  if (blockScore >= 4 || descriptionLength > 120) return 'medium';
  return 'compact';
}
