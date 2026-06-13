// src/pages/UserDashboard/components/blocks/SortableBlock.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Image as ImageIcon,
  Plus as PlusIcon,
  SeparatorHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { isRichTextEmpty, type RichText } from '@shared/lib/richText';
import type {
  RichBackspaceDetail,
  RichEnterDetail,
  RichPasteMultilineDetail,
} from '@shared/ui/RichTextBlockEditor';
import type { Block } from '../modals/article/EditArticleModalV2.utils';
import { isListBlockEmpty } from '../modals/article/EditArticleModalV2.utils';
import { BlockParagraph, type FormatType } from './BlockParagraph';
import { BlockTitle } from './BlockTitle';
import { BlockSubtitle } from './BlockSubtitle';
import { BlockQuote } from './BlockQuote';
import { BlockList } from './BlockList';
import { BlockDivider } from './BlockDivider';
import { BlockImage } from './BlockImage';
import { BlockCarousel } from './BlockCarousel';

interface SortableBlockProps {
  /** Владелец медиа статьи (Storage path) */
  articleOwnerUserId?: string;
  block: Block;
  index: number;
  isFocused: boolean;
  isSelected?: boolean;
  onUpdate: (blockId: string, updates: Partial<Block>) => void;
  onDelete: (blockId: string) => void;
  onFocus: (blockId: string) => void;
  onBlur: () => void;
  onSelect?: (blockId: string) => void;
  onEnter: (blockId: string, atEnd: boolean) => void;
  onBackspace: (isEmpty: boolean, atStart?: boolean) => void;
  onInsertAfter: (blockId: string, type: string) => void;
  onDuplicate: (blockId: string) => void;
  onMoveUp: (blockId: string) => void;
  onMoveDown: (blockId: string) => void;
  onSlash?: (blockId: string, position: { top: number; left: number }, cursorPos: number) => void;
  onFormat?: (blockId: string, type: FormatType, url?: string) => void;
  onPaste?: (blockId: string, text: string, files: File[]) => void;
  onRichEnter?: (blockId: string, detail: RichEnterDetail) => void;
  onRichBackspace?: (blockId: string, detail: RichBackspaceDetail) => void;
  onRichPasteMultiline?: (blockId: string, detail: RichPasteMultilineDetail) => void;
  onListConvertToParagraph?: (blockId: string, content: RichText) => void;
  onListInsertParagraphAfter?: (blockId: string) => void;
  onConvertToCarousel?: (blockId: string) => void;
  onVkPlusSelect?: (type: string) => void;
  onVkPlusClose?: () => void;
  onEditCarousel?: (blockId: string) => void;
  autoFocusCaret?: boolean;
  onAutoFocusCaret?: () => void;
}

export function SortableBlock({
  articleOwnerUserId,
  block,
  index,
  isFocused,
  isSelected,
  onUpdate,
  onDelete,
  onFocus,
  onBlur,
  onSelect,
  onEnter,
  onBackspace,
  onInsertAfter,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onSlash,
  onFormat,
  onPaste,
  onRichEnter,
  onRichBackspace,
  onRichPasteMultiline,
  onListConvertToParagraph,
  onListInsertParagraphAfter,
  onConvertToCarousel,
  onVkPlusSelect,
  onVkPlusClose,
  onEditCarousel,
  autoFocusCaret,
  onAutoFocusCaret,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderBlock = () => {
    switch (block.type) {
      case 'paragraph':
        return (
          <BlockParagraph
            blockId={block.id}
            value={block.content}
            onChange={(content) => onUpdate(block.id, { content } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
            onBackspace={(isEmpty, atStart) => onBackspace(isEmpty, atStart)}
            onSlash={(position, cursorPos) => onSlash?.(block.id, position, cursorPos)}
            onFormat={(type, url) => onFormat?.(block.id, type, url)}
            onPaste={(text, files) => onPaste?.(block.id, text, files)}
            onRichEnter={(detail) => onRichEnter?.(block.id, detail)}
            onRichBackspace={(detail) => onRichBackspace?.(block.id, detail)}
            onRichPasteMultiline={(detail) => onRichPasteMultiline?.(block.id, detail)}
            autoFocusCaret={autoFocusCaret}
            onAutoFocusCaret={onAutoFocusCaret}
          />
        );
      case 'title':
        return (
          <BlockTitle
            blockId={block.id}
            value={block.content}
            onChange={(content) => onUpdate(block.id, { content } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
            onBackspace={(isEmpty, atStart) => onBackspace(isEmpty, atStart)}
            onFormat={(type, url) => onFormat?.(block.id, type, url)}
            onRichEnter={(detail) => onRichEnter?.(block.id, detail)}
            onRichBackspace={(detail) => onRichBackspace?.(block.id, detail)}
            onRichPasteMultiline={(detail) => onRichPasteMultiline?.(block.id, detail)}
          />
        );
      case 'subtitle':
        return (
          <BlockSubtitle
            blockId={block.id}
            value={block.content}
            onChange={(content) => onUpdate(block.id, { content } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
            onBackspace={(isEmpty, atStart) => onBackspace(isEmpty, atStart)}
            onFormat={(type, url) => onFormat?.(block.id, type, url)}
            onRichEnter={(detail) => onRichEnter?.(block.id, detail)}
            onRichBackspace={(detail) => onRichBackspace?.(block.id, detail)}
            onRichPasteMultiline={(detail) => onRichPasteMultiline?.(block.id, detail)}
          />
        );
      case 'quote':
        return (
          <BlockQuote
            blockId={block.id}
            value={block.content}
            onChange={(content) => onUpdate(block.id, { content } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
            onBackspace={(isEmpty, atStart) => onBackspace(isEmpty, atStart)}
            onFormat={(type, url) => onFormat?.(block.id, type, url)}
            onRichEnter={(detail) => onRichEnter?.(block.id, detail)}
            onRichBackspace={(detail) => onRichBackspace?.(block.id, detail)}
            onRichPasteMultiline={(detail) => onRichPasteMultiline?.(block.id, detail)}
          />
        );
      case 'list':
        return (
          <BlockList
            blockId={block.id}
            value={block.items}
            onChange={(items) => onUpdate(block.id, { items } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onConvertToParagraph={(content) => onListConvertToParagraph?.(block.id, content)}
            onInsertParagraphAfter={() => onListInsertParagraphAfter?.(block.id)}
          />
        );
      case 'divider':
        return (
          <BlockDivider
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            onEnter={() => onEnter(block.id, true)}
          />
        );
      case 'image':
        return (
          <BlockImage
            imageKey={block.imageKey}
            caption={block.caption}
            onChange={(imageKey, caption) =>
              onUpdate(block.id, { imageKey, caption } as Partial<Block>)
            }
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            isSelected={isSelected}
            onSelect={() => onSelect?.(block.id)}
            onConvertToCarousel={() => onConvertToCarousel?.(block.id)}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
          />
        );
      case 'carousel':
        return (
          <BlockCarousel
            mediaOwnerUserId={articleOwnerUserId}
            images={block.images}
            onChange={(images) => onUpdate(block.id, { images } as Partial<Block>)}
            onFocus={() => onFocus(block.id)}
            onBlur={onBlur}
            isSelected={isSelected}
            onSelect={() => onSelect?.(block.id)}
            onEdit={() => onEditCarousel?.(block.id)}
            onEnter={(atEnd) => onEnter(block.id, atEnd)}
          />
        );
      default:
        return null;
    }
  };

  // Проверяем, пустой ли блок
  const isBlockEmpty = (() => {
    if (
      block.type === 'paragraph' ||
      block.type === 'title' ||
      block.type === 'subtitle' ||
      block.type === 'quote'
    ) {
      return isRichTextEmpty(block.content);
    }
    if (block.type === 'list') {
      return isListBlockEmpty(block.items);
    }
    if (block.type === 'divider') {
      return false; // Divider всегда "не пустой"
    }
    if (block.type === 'image') {
      return !block.imageKey || block.imageKey === '';
    }
    if (block.type === 'carousel') {
      return !block.images || block.images.length === 0;
    }
    return false;
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-id={block.id}
      className={`edit-article-v2__block-wrapper edit-article-v2__block-wrapper--${block.type} ${
        isFocused ? 'is-focused' : ''
      } ${isDragging ? 'is-dragging' : ''} ${
        isSelected ? 'edit-article-v2__block-wrapper--selected' : ''
      } ${isBlockEmpty ? 'is-empty' : ''}`}
    >
      {/* Drag handle / VK plus — колонка слева, в потоке документа (не обрезается overflow) */}
      <div className="edit-article-v2__block-gutter">
        {!isBlockEmpty && (
          <div
            className="edit-article-v2__drag-handle"
            {...attributes}
            {...listeners}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <span className="edit-article-v2__drag-handle-icon">⠿</span>
          </div>
        )}
        {isBlockEmpty && onVkPlusSelect && onVkPlusClose && (
          <VkPlusInserter onSelect={onVkPlusSelect} onClose={onVkPlusClose} />
        )}
      </div>

      {/* Block content */}
      <div className="edit-article-v2__block-content">{renderBlock()}</div>
    </div>
  );
}

// Компонент VK-стиля плюса
function VkPlusInserter({
  onSelect,
  onClose,
}: {
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipOutsideCloseRef = useRef(false);

  const openMenu = useCallback(() => {
    skipOutsideCloseRef.current = true;
    setIsOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (skipOutsideCloseRef.current) {
        skipOutsideCloseRef.current = false;
        return;
      }

      const target = event.target as Node;
      if (rootRef.current?.contains(target)) {
        return;
      }

      closeMenu();

      const blockWrapper = rootRef.current?.closest('.edit-article-v2__block-wrapper');
      const isClickInSameBlock = blockWrapper && blockWrapper.contains(event.target as Node);

      if (!isClickInSameBlock) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, closeMenu, onClose]);

  const blockTypes: { type: string; label: string; Icon: LucideIcon }[] = [
    { type: 'image', label: 'Фотография', Icon: ImageIcon },
    { type: 'divider', label: 'Разделитель', Icon: SeparatorHorizontal },
  ];

  return (
    <div ref={rootRef} className="edit-article-v2__vk-plus">
      <button
        type="button"
        className={`edit-article-v2__vk-plus-button${
          isOpen ? ' edit-article-v2__vk-plus-button--active' : ''
        }`}
        aria-label="Добавить блок"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <PlusIcon size={18} strokeWidth={2} aria-hidden />
      </button>
      {isOpen && (
        <div className="edit-article-v2__vk-plus-menu" role="menu">
          {blockTypes.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              className="edit-article-v2__vk-plus-menu-item"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                onSelect(type);
                closeMenu();
                e.currentTarget.blur();
              }}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
