// src/pages/UserDashboard/components/blocks/BlockList.tsx
import React, { useLayoutEffect, useRef } from 'react';
import type { RichText } from '@shared/lib/richText';
import { isRichTextEmpty, richTextToPlainText } from '@shared/lib/richText';
import type {
  RichBackspaceDetail,
  RichEnterDetail,
  RichPasteMultilineDetail,
} from '@shared/ui/RichTextBlockEditor';
import {
  createListItem,
  createListItemFromRichText,
  mergeListItemContents,
  type ArticleListItem,
} from '../modals/article/EditArticleModalV2.utils';
import { BlockListItemField, focusListItemField } from './BlockListItemField';

interface BlockListProps {
  blockId: string;
  value: ArticleListItem[];
  onChange: (items: ArticleListItem[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onConvertToParagraph?: (content: RichText) => void;
  onInsertParagraphAfter?: () => void;
}

type PendingItemFocus = {
  itemId: string;
  offset: number | 'start' | 'end';
};

export function BlockList({
  blockId,
  value,
  onChange,
  onFocus,
  onBlur,
  onConvertToParagraph,
  onInsertParagraphAfter,
}: BlockListProps) {
  const items = value.length > 0 ? value : [createListItem('')];
  const pendingFocusRef = useRef<PendingItemFocus | null>(null);

  const scheduleFocus = (itemId: string, offset: number | 'start' | 'end' = 'start') => {
    pendingFocusRef.current = { itemId, offset };
  };

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    requestAnimationFrame(() => {
      focusListItemField(blockId, pending.itemId, pending.offset);
    });
  }, [blockId, items]);

  const mergeAllItemContents = (): RichText => {
    let merged = createListItem('').content;
    for (const item of items) {
      merged = mergeListItemContents(merged, item.content);
    }
    return merged;
  };

  const handleItemChange = (index: number, content: RichText) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], content };
    const filtered = newItems.filter((item) => !isRichTextEmpty(item.content));
    onChange(filtered.length > 0 ? filtered : [createListItem('')]);
  };

  const insertItemAfter = (index: number, item: ArticleListItem) => {
    const newItems = [...items];
    newItems.splice(index + 1, 0, item);
    onChange(newItems);
    scheduleFocus(item.id, 'start');
  };

  const handleEmptyItemEnter = (index: number) => {
    if (items.length === 1) {
      onConvertToParagraph?.(createListItem('').content);
      return;
    }

    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
    onInsertParagraphAfter?.();
  };

  const handleItemEnter = (index: number, atEnd: boolean) => {
    const item = items[index];
    if (isRichTextEmpty(item.content)) {
      handleEmptyItemEnter(index);
      return;
    }

    if (atEnd) {
      const newItem = createListItem('');
      insertItemAfter(index, newItem);
    }
  };

  const handleRichItemEnter = (index: number, detail: RichEnterDetail) => {
    const item = items[index];
    if (isRichTextEmpty(item.content) && detail.atEnd) {
      handleEmptyItemEnter(index);
      return;
    }

    if (detail.atEnd) {
      insertItemAfter(index, createListItem(''));
      return;
    }

    if (detail.after) {
      const newItem = createListItemFromRichText(detail.after);
      insertItemAfter(index, newItem);
    }
  };

  const handleEmptyItemBackspace = (index: number) => {
    if (index === 0) {
      onConvertToParagraph?.(mergeAllItemContents());
      return;
    }

    const prev = items[index - 1];
    const merged = mergeListItemContents(prev.content, items[index].content);
    const newItems = [...items];
    newItems[index - 1] = { ...prev, content: merged };
    newItems.splice(index, 1);
    onChange(newItems);
    scheduleFocus(prev.id, richTextToPlainText(prev.content).length);
  };

  const handleItemBackspace = (index: number, isEmpty: boolean) => {
    if (!isEmpty) return;
    handleEmptyItemBackspace(index);
  };

  const handleRichItemBackspace = (index: number, detail: RichBackspaceDetail) => {
    if (!detail.isEmpty || !detail.atStart) return;
    handleEmptyItemBackspace(index);
  };

  const handleRichItemPasteMultiline = (index: number, detail: RichPasteMultilineDetail) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], content: detail.leadingContent };

    const inserted: ArticleListItem[] = [
      ...detail.middleBlocks.map((content) => createListItemFromRichText(content)),
      createListItemFromRichText(detail.trailingContent),
    ];
    newItems.splice(index + 1, 0, ...inserted);
    onChange(newItems);

    const focusItem = inserted[inserted.length - 1];
    scheduleFocus(focusItem.id, detail.focusOffset);
  };

  return (
    <ul className="edit-article-v2__block edit-article-v2__block--list">
      {items.map((item, index) => (
        <BlockListItemField
          key={item.id}
          listBlockId={blockId}
          itemId={item.id}
          value={item.content}
          onChange={(content) => handleItemChange(index, content)}
          onEnter={(atEnd) => handleItemEnter(index, atEnd)}
          onBackspace={(isEmpty) => handleItemBackspace(index, isEmpty)}
          onRichEnter={(detail) => handleRichItemEnter(index, detail)}
          onRichBackspace={(detail) => handleRichItemBackspace(index, detail)}
          onRichPasteMultiline={(detail) => handleRichItemPasteMultiline(index, detail)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={`Элемент ${index + 1}`}
        />
      ))}
    </ul>
  );
}
