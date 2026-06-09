// src/pages/UserDashboard/components/EditArticleModalV2.utils.ts
import type { ArticledetailsProps } from '@models';
import type { RichText } from '@shared/lib/richText';
import { isRichTextEmpty, markdownToRichText, richTextToMarkdown } from '@shared/lib/richText';

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
  | { id: string; type: 'carousel'; imageKeys: string[]; caption?: string };

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
    return { id, type: 'image', imageKey, caption: detail.alt || undefined };
  }

  if (detail.type === 'carousel') {
    const imageKeys = detail.images || (Array.isArray(detail.img) ? detail.img : []);
    if (!imageKeys.length) return null;
    return { id, type: 'carousel', imageKeys, caption: detail.alt || undefined };
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
        caption: detail.alt || undefined,
      });
    }
  }

  if (detail.type === 'carousel') {
    const imageKeys = detail.images || (Array.isArray(detail.img) ? detail.img : []);
    if (imageKeys.length > 0) {
      blocks.push({
        id: detail.blockId?.trim() || generateId(),
        type: 'carousel',
        imageKeys,
        caption: detail.alt || undefined,
      });
    }
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
        alt: block.caption,
      };
    case 'carousel':
      if (!block.imageKeys.length) return null;
      return {
        type: 'carousel',
        blockId: block.id,
        blockKind: 'carousel',
        images: block.imageKeys,
        alt: block.caption,
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

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
