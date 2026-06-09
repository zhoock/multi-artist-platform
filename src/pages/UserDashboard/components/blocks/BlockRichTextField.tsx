import React, { useEffect, useRef, useState } from 'react';
import type { RichText } from '@shared/lib/richText';
import {
  RichTextBlockEditor,
  type RichBackspaceDetail,
  type RichEnterDetail,
  type RichPasteMultilineDetail,
  type RichTextBlockEditorMode,
  type RichTextBlockEditorVariant,
} from '@shared/ui/RichTextBlockEditor';
import { FormatMenu, type FormatType } from './BlockParagraph';

export interface BlockRichTextFieldProps {
  variant: Exclude<RichTextBlockEditorVariant, 'paragraph'>;
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
  blockId?: string;
}

export function BlockRichTextField({
  variant,
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
  blockId,
}: BlockRichTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [mode, setMode] = useState<RichTextBlockEditorMode>('textarea');

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

  const editor = (
    <>
      <RichTextBlockEditor
        content={value}
        onChange={onChange}
        variant={variant}
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          if (next !== 'textarea') {
            setShowFormatMenu(false);
          }
        }}
        textareaRef={textareaRef}
        blockId={blockId}
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
    </>
  );

  if (variant === 'title') {
    return <h3>{editor}</h3>;
  }
  if (variant === 'subtitle') {
    return <h4>{editor}</h4>;
  }
  return <p className="edit-article-v2__block edit-article-v2__block--quote">{editor}</p>;
}
