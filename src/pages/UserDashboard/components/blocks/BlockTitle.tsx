// src/pages/UserDashboard/components/blocks/BlockTitle.tsx
import React, { useRef, useEffect, useState } from 'react';
import type { RichText } from '@shared/lib/richText';
import { FormatMenu, type FormatType } from './BlockParagraph';
import { useLocalMarkdownBuffer } from './useLocalMarkdownBuffer';

interface BlockTitleProps {
  value: RichText;
  onChange: (content: RichText) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: (atEnd: boolean) => void;
  onBackspace?: (isEmpty: boolean, atStart?: boolean) => void;
  onFormat?: (type: FormatType, url?: string) => void;
  placeholder?: string;
  blockId?: string;
}

export function BlockTitle({
  value,
  onChange,
  onFocus,
  onBlur,
  onEnter,
  onBackspace,
  onFormat,
  placeholder = 'Заголовок',
  blockId,
}: BlockTitleProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const { localMarkdown, handleChange: handleMarkdownChange } = useLocalMarkdownBuffer(
    value,
    onChange
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localMarkdown]);

  // Обработчики для отслеживания выделения текста (включая существующий текст)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

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
        requestAnimationFrame(() => {
          checkSelection();
        });
      });
    };

    const handleNativeSelect = () => {
      checkSelection();
    };

    const handleNativeKeyUp = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          checkSelection();
        });
      });
    };

    const handleSelectionChange = () => {
      if (document.activeElement === textarea) {
        checkSelection();
      }
    };

    textarea.addEventListener('mouseup', handleNativeMouseUp, true);
    textarea.addEventListener('select', handleNativeSelect, true);
    textarea.addEventListener('keyup', handleNativeKeyUp, true);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      textarea.removeEventListener('mouseup', handleNativeMouseUp, true);
      textarea.removeEventListener('select', handleNativeSelect, true);
      textarea.removeEventListener('keyup', handleNativeKeyUp, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleMarkdownChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const isAtEnd = textarea.selectionStart === textarea.value.length;
      onEnter?.(isAtEnd);
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
    <h3>
      <textarea
        ref={textareaRef}
        className="edit-article-v2__block edit-article-v2__block--title"
        data-block-id={blockId}
        value={localMarkdown}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={(e) => {
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
        placeholder={placeholder}
        rows={1}
      />
      {showFormatMenu && (
        <FormatMenu
          textarea={textareaRef.current}
          content={value}
          onFormat={onFormat}
          onClose={() => setShowFormatMenu(false)}
        />
      )}
    </h3>
  );
}
