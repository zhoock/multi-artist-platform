// src/pages/UserDashboard/components/EditArticleModalV2.utils.ts
import type { ArticledetailsProps, CarouselImageItem } from '@models';
import {
  mergeCarouselImageKeys,
  parseCarouselImagesFromDetail,
  resolveDetailCaption,
  serializeCarouselImagesForDetail,
} from '@entities/article';
import { buildPublicArticlePagePath } from '@shared/lib/seo/publicPagePaths';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import type { RichText } from '@shared/lib/richText';
import {
  isRichTextEmpty,
  markdownToRichText,
  normalizeRichText,
  richTextToMarkdown,
  cloneRichText,
} from '@shared/lib/richText';

/**
 * Типы блоков редактора (block-based, как VK)
 */
export type BlockType =
  | 'paragraph'
  | 'title'
  | 'subtitle'
  | 'quote'
  | 'list'
  | 'divider'
  | 'image'
  | 'carousel';

/**
 * Элемент списка. Inline-содержимое хранится как каноническая RichText-модель;
 * markdown остаётся форматом сериализации (см. serializeListItemsToDetailContent).
 */
export type ArticleListItem = {
  id: string;
  content: RichText;
};

export type Block =
  | { id: string; type: 'paragraph'; content: RichText }
  | { id: string; type: 'title'; content: RichText }
  | { id: string; type: 'subtitle'; content: RichText }
  | { id: string; type: 'quote'; content: RichText }
  | { id: string; type: 'list'; items: ArticleListItem[] }
  | { id: string; type: 'divider' }
  | { id: string; type: 'image'; imageKey: string; caption?: string }
  | { id: string; type: 'carousel'; images: CarouselImageItem[] };

/** Минимум сохранённых изображений, при котором блок считается каруселью. */
export const MIN_CAROUSEL_IMAGES = 2;

export type { CarouselImageItem };

export function isSavedCarousel(images: CarouselImageItem[]): boolean {
  return images.length >= MIN_CAROUSEL_IMAGES;
}

/** Применяет результат сохранения редактора карусели к блоку (≥2 фото → carousel, иначе → image). */
export function blockFromCarouselSave(blockId: string, images: CarouselImageItem[]): Block {
  if (isSavedCarousel(images)) {
    return { id: blockId, type: 'carousel', images };
  }
  if (images.length === 1) {
    return {
      id: blockId,
      type: 'image',
      imageKey: images[0].imageKey,
      caption: images[0].caption,
    };
  }
  return { id: blockId, type: 'image', imageKey: '' };
}

function blockFromPersistedCarouselImages(id: string, images: CarouselImageItem[]): Block | null {
  if (isSavedCarousel(images)) {
    return { id, type: 'carousel', images };
  }
  if (images.length === 1) {
    return {
      id,
      type: 'image',
      imageKey: images[0].imageKey,
      caption: images[0].caption,
    };
  }
  return null;
}

export { mergeCarouselImageKeys };

/** Пустое inline-содержимое для нового/пустого текстового блока. */
export function emptyRichText(): RichText {
  return markdownToRichText('');
}

export interface ArticleMeta {
  title: string;
  description: string;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function generateListItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `list_item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createListItem(markdown = ''): ArticleListItem {
  return { id: generateListItemId(), content: markdownToRichText(markdown) };
}

export function createListItemFromRichText(content: RichText): ArticleListItem {
  return { id: generateListItemId(), content: cloneRichText(content) };
}

export function mergeListItemContents(first: RichText, second: RichText): RichText {
  return normalizeRichText([...first, ...second]);
}

export function isListBlockEmpty(items: ArticleListItem[]): boolean {
  return items.every((item) => isRichTextEmpty(item.content));
}

function cleanLegacyText(text: string): string {
  return text.replace(/^\+\++/, '');
}

export function parseListItemsFromDetailContent(content: unknown[]): ArticleListItem[] {
  const out: ArticleListItem[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      const text = cleanLegacyText(item).trim();
      if (!text) continue;
      out.push({ id: generateListItemId(), content: markdownToRichText(text) });
      continue;
    }
    if (item && typeof item === 'object' && 'text' in item) {
      const raw = item as { id?: unknown; text?: unknown };
      const text = cleanLegacyText(String(raw.text ?? '')).trim();
      if (!text) continue;
      const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateListItemId();
      out.push({ id, content: markdownToRichText(text) });
    }
  }
  return out;
}

function serializeListItemsToDetailContent(
  items: ArticleListItem[]
): NonNullable<ArticledetailsProps['content']> {
  return items
    .map((item) => ({
      id: item.id,
      text: cleanLegacyText(richTextToMarkdown(item.content)),
    }))
    .filter((item) => item.text.trim());
}

function hasPersistedBlockIds(details: ArticledetailsProps[]): boolean {
  return details.some((detail) => typeof detail?.blockId === 'string' && detail.blockId.trim());
}

function detailWithBlockIdToBlock(detail: ArticledetailsProps): Block | null {
  const id = detail.blockId?.trim();
  if (!id) return null;

  if (detail.type === 'image' && detail.img) {
    const imageKey = typeof detail.img === 'string' ? detail.img : detail.img[0] || '';
    if (!imageKey) return null;
    return { id, type: 'image', imageKey, caption: resolveDetailCaption(detail) };
  }

  if (detail.type === 'carousel') {
    const images = parseCarouselImagesFromDetail(detail);
    return blockFromPersistedCarouselImages(id, images);
  }

  if (detail.title) {
    return { id, type: 'title', content: markdownToRichText(cleanLegacyText(detail.title)) };
  }

  if (detail.subtitle) {
    return {
      id,
      type: 'subtitle',
      content: markdownToRichText(cleanLegacyText(detail.subtitle)),
    };
  }

  if (detail.content === '---') {
    return { id, type: 'divider' };
  }

  if (typeof detail.content === 'string') {
    if (detail.blockKind === 'quote') {
      return { id, type: 'quote', content: markdownToRichText(cleanLegacyText(detail.content)) };
    }
    return {
      id,
      type: 'paragraph',
      content: markdownToRichText(cleanLegacyText(detail.content)),
    };
  }

  if (Array.isArray(detail.content)) {
    const items = parseListItemsFromDetailContent(detail.content);
    if (!items.length) return null;
    return { id, type: 'list', items };
  }

  return null;
}

function legacyDetailToBlocks(detail: ArticledetailsProps): Block[] {
  const blocks: Block[] = [];

  if (detail.title) {
    blocks.push({
      id: detail.blockId?.trim() || generateId(),
      type: 'title',
      content: markdownToRichText(cleanLegacyText(detail.title)),
    });
  }

  if (detail.subtitle) {
    blocks.push({
      id: generateId(),
      type: 'subtitle',
      content: markdownToRichText(cleanLegacyText(detail.subtitle)),
    });
  }

  if (detail.type === 'image' && detail.img) {
    const imageKey = typeof detail.img === 'string' ? detail.img : detail.img[0] || '';
    if (imageKey) {
      blocks.push({
        id: detail.blockId?.trim() || generateId(),
        type: 'image',
        imageKey,
        caption: resolveDetailCaption(detail),
      });
    }
  }

  if (detail.type === 'carousel') {
    const images = parseCarouselImagesFromDetail(detail);
    const block = blockFromPersistedCarouselImages(detail.blockId?.trim() || generateId(), images);
    if (block) blocks.push(block);
  }

  if (detail.content) {
    if (typeof detail.content === 'string') {
      if (detail.content === '---') {
        blocks.push({ id: generateId(), type: 'divider' });
      } else {
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          content: markdownToRichText(cleanLegacyText(detail.content)),
        });
      }
    } else if (Array.isArray(detail.content)) {
      const items = parseListItemsFromDetailContent(detail.content);
      if (items.length > 0) {
        blocks.push({
          id: detail.blockId?.trim() || generateId(),
          type: 'list',
          items,
        });
      }
    }
  } else if (
    !detail.title &&
    !detail.subtitle &&
    detail.type !== 'image' &&
    detail.type !== 'carousel'
  ) {
    blocks.push({ id: generateId(), type: 'paragraph', content: emptyRichText() });
  }

  return blocks;
}

/**
 * Преобразует старую структуру details в новую структуру блоков
 */
export function normalizeDetailsToBlocks(details: ArticledetailsProps[]): Block[] {
  if (!details || !Array.isArray(details) || details.length === 0) {
    return [{ id: generateId(), type: 'paragraph', content: emptyRichText() }];
  }

  const blocks: Block[] = [];

  if (hasPersistedBlockIds(details)) {
    for (const detail of details) {
      if (!detail) continue;
      const block = detailWithBlockIdToBlock(detail);
      if (block) blocks.push(block);
    }
  } else {
    for (const detail of details) {
      if (!detail) continue;
      blocks.push(...legacyDetailToBlocks(detail));
    }
  }

  if (blocks.length === 0) {
    blocks.push({ id: generateId(), type: 'paragraph', content: emptyRichText() });
  }

  return blocks;
}

function blockToDetail(block: Block): ArticledetailsProps | null {
  switch (block.type) {
    case 'title':
      return {
        type: 'text',
        blockId: block.id,
        blockKind: 'title',
        title: richTextToMarkdown(block.content),
      };
    case 'subtitle':
      return {
        type: 'text',
        blockId: block.id,
        blockKind: 'subtitle',
        subtitle: richTextToMarkdown(block.content),
      };
    case 'quote':
      return {
        type: 'text',
        blockId: block.id,
        blockKind: 'quote',
        content: cleanLegacyText(richTextToMarkdown(block.content)) || undefined,
      };
    case 'paragraph': {
      const text = cleanLegacyText(richTextToMarkdown(block.content));
      return {
        type: 'text',
        blockId: block.id,
        blockKind: 'paragraph',
        content: text || undefined,
      };
    }
    case 'list': {
      const content = serializeListItemsToDetailContent(block.items);
      if (!content.length) return null;
      return { type: 'text', blockId: block.id, blockKind: 'list', content };
    }
    case 'divider':
      return { type: 'text', blockId: block.id, blockKind: 'divider', content: '---' };
    case 'image':
      if (!block.imageKey.trim()) return null;
      return {
        type: 'image',
        blockId: block.id,
        blockKind: 'image',
        img: block.imageKey,
        caption: block.caption,
      };
    case 'carousel':
      if (!isSavedCarousel(block.images)) {
        if (block.images.length === 1) {
          return {
            type: 'image',
            blockId: block.id,
            blockKind: 'image',
            img: block.images[0].imageKey,
            caption: block.images[0].caption,
          };
        }
        return null;
      }
      return {
        type: 'carousel',
        blockId: block.id,
        blockKind: 'carousel',
        images: serializeCarouselImagesForDetail(block.images),
      };
    default:
      return null;
  }
}

/**
 * Преобразует блоки обратно в структуру details для сохранения (один блок → одна строка details с blockId).
 */
export function blocksToDetails(blocks: Block[]): ArticledetailsProps[] {
  const details: ArticledetailsProps[] = [];
  for (const block of blocks) {
    const detail = blockToDetail(block);
    if (detail && hasContent(detail)) {
      details.push(detail);
    }
  }
  return details;
}

function hasContent(detail: Partial<ArticledetailsProps>): boolean {
  return !!(
    detail.title ||
    detail.subtitle ||
    detail.content ||
    detail.type === 'image' ||
    detail.type === 'carousel'
  );
}

export function buildArticlePublicPath(
  articleId: string,
  lang: RouteLang,
  artistSlug?: string | null
): string {
  return buildPublicArticlePagePath(lang, articleId, artistSlug);
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.clone().json();
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
      }
      if (typeof record.error === 'string' && record.error.trim()) {
        return record.error.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}
