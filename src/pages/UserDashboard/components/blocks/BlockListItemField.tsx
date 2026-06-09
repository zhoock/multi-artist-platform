import React, { useEffect, useRef, useState } from 'react';
import type { RichText } from '@shared/lib/richText';
import { restoreSelection } from '@shared/lib/richText';
import {
  RichTextBlockEditor,
  type RichBackspaceDetail,
  type RichEnterDetail,
  type RichPasteMultilineDetail,
  type RichTextBlockEditorMode,
} from '@shared/ui/RichTextBlockEditor';
import { FormatMenu, type FormatType } from './BlockParagraph';

export interface BlockListItemFieldProps {
  listBlockId: string;
  itemId: string;
  value: RichText;
  onChange: (content: RichText) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: (atEnd: boolean) => void;
  onBackspace?: (isEmpty: boolean, atStart?: boolean) => void;
  onFormat?: (type: FormatType, url?: string) => void;
  onRichEnter?: (detail: RichEnterDetail) => void;
  onRichBackspace?: (detail: RichBackspaceDetail) => void;
  onRichPasteMultiline?: (detail: RichPasteMultilineDetail) => void;
  placeholder?: string;
}

export function BlockListItemField({
  listBlockId,
  itemId,
  value,
  onChange,
  onFocus,
  onBlur,
  onEnter,
  onBackspace,
  onFormat,
  onRichEnter,
  onRichBackspace,
  onRichPasteMultiline,
  placeholder,
}: BlockListItemFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [mode, setMode] = useState<RichTextBlockEditorMode>('textarea');
  const editorBlockId = `${listBlockId}:${itemId}`;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || mode !== 'textarea') return;

    const checkSelection = () => {
      requestAnimationFrame(() => {
        if (textarea.selectionStart !== textarea.selectionEnd) {
          setShowFormatMenu(true);
        } else {
          setShowFormatMenu(false);
        }
      });
    };

    const handleNativeMouseUp = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(checkSelection);
      });
    };

    textarea.addEventListener('mouseup', handleNativeMouseUp, true);
    textarea.addEventListener('select', checkSelection, true);
    textarea.addEventListener('keyup', handleNativeMouseUp, true);

    const handleSelectionChange = () => {
      if (document.activeElement === textarea) {
        checkSelection();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      textarea.removeEventListener('mouseup', handleNativeMouseUp, true);
      textarea.removeEventListener('select', checkSelection, true);
      textarea.removeEventListener('keyup', handleNativeMouseUp, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      onFormat?.('bold');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      onFormat?.('italic');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      onFormat?.('link');
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textarea = e.currentTarget;
      onEnter?.(textarea.selectionStart === textarea.value.length);
    } else if (e.key === 'Backspace') {
      const textarea = e.currentTarget;
      const isAtStart = textarea.selectionStart === 0;
      const isEmpty = textarea.value === '';

      if (isEmpty) {
        e.preventDefault();
        onBackspace?.(true, isAtStart);
      } else if (isAtStart) {
        setTimeout(() => {
          onBackspace?.(false, true);
        }, 0);
      }
    }
  };

  return (
    <li className="edit-article-v2__block--list-item" data-list-item-id={itemId}>
      <RichTextBlockEditor
        content={value}
        onChange={onChange}
        variant="list-item"
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          if (next !== 'textarea') {
            setShowFormatMenu(false);
          }
        }}
        textareaRef={textareaRef}
        blockId={editorBlockId}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onRichEnter={mode === 'rich' ? onRichEnter : undefined}
        onRichBackspace={mode === 'rich' ? onRichBackspace : undefined}
        onRichPasteMultiline={mode === 'rich' ? onRichPasteMultiline : undefined}
        onFocus={onFocus}
        onBlur={() => {
          setTimeout(() => {
            const active = document.activeElement;
            if (
              active !== textareaRef.current &&
              !active?.closest('.edit-article-v2__format-menu')
            ) {
              setShowFormatMenu(false);
            }
          }, 100);
          onBlur?.();
        }}
      />
      {showFormatMenu && mode === 'textarea' && (
        <FormatMenu
          textarea={textareaRef.current}
          content={value}
          onFormat={onFormat}
          onClose={() => setShowFormatMenu(false)}
        />
      )}
    </li>
  );
}

/** Фокус list item в textarea или rich mode по itemId. */
export function focusListItemField(
  listBlockId: string,
  itemId: string,
  offset: number | 'start' | 'end' = 'start'
): boolean {
  const blockId = `${listBlockId}:${itemId}`;
  const rich = document.querySelector(
    `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
  ) as HTMLElement | null;
  if (rich) {
    rich.focus();
    if (offset === 'start') {
      restoreSelection(rich, 0, 0);
    } else if (offset === 'end') {
      restoreSelection(rich, rich.innerText.length, rich.innerText.length);
    } else {
      restoreSelection(rich, offset, offset);
    }
    return true;
  }

  const textarea = document.querySelector(
    `textarea[data-block-id="${blockId}"], [data-block-id="${blockId}"] textarea`
  ) as HTMLTextAreaElement | null;
  if (!textarea) return false;

  textarea.focus();
  if (offset === 'start') {
    textarea.setSelectionRange(0, 0);
  } else if (offset === 'end') {
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  } else {
    textarea.setSelectionRange(offset, offset);
  }
  return true;
}
