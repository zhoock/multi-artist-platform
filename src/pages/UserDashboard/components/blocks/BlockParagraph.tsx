// src/pages/UserDashboard/components/blocks/BlockParagraph.tsx
import React, { useRef, useEffect, useState } from 'react';
import { TextQuote as TextQuoteIcon } from 'lucide-react';
import type { RichText } from '@shared/lib/richText';
import { getDefaultEditorMode, isMarkdownEditorEnabled } from '@shared/lib/richText';
import {
  RichTextBlockEditor,
  type RichBackspaceDetail,
  type RichEnterDetail,
  type RichPasteMultilineDetail,
  type RichTextBlockEditorMode,
} from '@shared/ui/RichTextBlockEditor';
import {
  emptyFormatMenuActiveState,
  getFormatMenuActiveState,
  type FormatMenuActiveState,
} from './formatMenuSelection';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

/**
 * Набор действий floating-тулбара выделения — строго как в редакторе статей ВКонтакте.
 * Инлайн-форматирование (bold/italic/strikethrough/link) + блочные стили
 * (heading-large/heading-small/quote).
 */
export type FormatType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'link'
  | 'heading-large'
  | 'heading-small'
  | 'quote';

interface BlockParagraphProps {
  value: RichText;
  onChange: (content: RichText) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: (atEnd: boolean) => void;
  onBackspace?: (isEmpty: boolean, atStart?: boolean) => void;
  onSlash?: (position: { top: number; left: number }, cursorPos: number) => void;
  onFormat?: (type: FormatType, url?: string) => void;
  onPaste?: (text: string, files: File[]) => void;
  onRichEnter?: (detail: RichEnterDetail) => void;
  onRichBackspace?: (detail: RichBackspaceDetail) => void;
  onRichPasteMultiline?: (detail: RichPasteMultilineDetail) => void;
  placeholder?: string;
  blockId?: string;
  autoFocusCaret?: boolean;
  onAutoFocusCaret?: () => void;
}

export function BlockParagraph({
  value,
  onChange,
  onFocus,
  onBlur,
  onEnter,
  onBackspace,
  onSlash,
  onFormat,
  onPaste,
  onRichEnter,
  onRichBackspace,
  onRichPasteMultiline,
  placeholder = '',
  blockId,
  autoFocusCaret,
  onAutoFocusCaret,
}: BlockParagraphProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [mode, setMode] = useState(getDefaultEditorMode);
  const markdownDebug = isMarkdownEditorEnabled();

  const handleChange = (newValue: string, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Проверка на "/" в начале строки для slash-меню
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const lineText = textBeforeCursor.substring(lineStart);

    if (lineText === '/' && onSlash) {
      const textarea = e.target;
      const rect = textarea.getBoundingClientRect();
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const lines = textBeforeCursor.split('\n').length - 1;
      const top = rect.top + lines * lineHeight + lineHeight;
      const left = rect.left + 10; // Небольшой отступ

      onSlash({ top, left }, cursorPos);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + B для Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      onFormat?.('bold');
      return;
    }

    // Ctrl/Cmd + I для Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      onFormat?.('italic');
      return;
    }

    // Ctrl/Cmd + K для Link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      onFormat?.('link');
      return;
    }

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
        // Не предотвращаем стандартное поведение, но вызываем callback для слияния
        // Это позволит обработать слияние после того, как Backspace уже обработан
        setTimeout(() => {
          onBackspace?.(false, true);
        }, 0);
      }
    }
  };

  // Эти функции больше не используются - используем нативные события через useEffect
  // Оставлены для обратной совместимости, если они где-то вызываются

  // Обработчики для отслеживания выделения текста (включая существующий текст)
  useEffect(() => {
    if (!markdownDebug) return;
    const textarea = textareaRef.current;
    if (!textarea || mode !== 'textarea') return;

    const checkSelection = () => {
      // Используем requestAnimationFrame для гарантии, что выделение обновлено
      requestAnimationFrame(() => {
        if (textarea.selectionStart !== textarea.selectionEnd) {
          setShowFormatMenu(true);
        } else {
          setShowFormatMenu(false);
        }
      });
    };

    // Обработчик для mouseup (выделение мышью) - нативное событие
    const handleNativeMouseUp = () => {
      // Двойной requestAnimationFrame для надежности
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          checkSelection();
        });
      });
    };

    // Обработчик для select (нативное событие textarea)
    const handleNativeSelect = () => {
      checkSelection();
    };

    // Обработчик для keyup (выделение клавиатурой)
    const handleNativeKeyUp = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          checkSelection();
        });
      });
    };

    // Обработчик для selectionchange (глобальное событие)
    const handleSelectionChange = () => {
      if (document.activeElement === textarea) {
        checkSelection();
      }
    };

    // Нативные события на textarea для более надежной работы с существующим текстом
    textarea.addEventListener('mouseup', handleNativeMouseUp, true); // useCapture = true
    textarea.addEventListener('select', handleNativeSelect, true);
    textarea.addEventListener('keyup', handleNativeKeyUp, true);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      textarea.removeEventListener('mouseup', handleNativeMouseUp, true);
      textarea.removeEventListener('select', handleNativeSelect, true);
      textarea.removeEventListener('keyup', handleNativeKeyUp, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [markdownDebug, mode]); // Убираем value из зависимостей, чтобы обработчики не пересоздавались

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    const items = Array.from(clipboardData.items);

    // Проверяем наличие изображений
    const imageFiles: File[] = [];
    let hasPlainText = false;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      } else if (item.type === 'text/plain') {
        hasPlainText = true;
      }
    }

    // Если есть изображения, обрабатываем их через onPaste
    if (imageFiles.length > 0 && onPaste) {
      e.preventDefault();
      const text = clipboardData.getData('text/plain');
      onPaste(text, imageFiles);
      return;
    }

    // Если это только текст, проверяем, нужно ли преобразовать в список
    if (hasPlainText && !imageFiles.length) {
      const pastedText = clipboardData.getData('text/plain');
      const lines = pastedText.split('\n').filter((line) => line.trim());

      // Если больше 2 строк, предлагаем преобразовать в список (или делаем автоматически)
      if (lines.length > 2 && onPaste) {
        e.preventDefault();
        onPaste(pastedText, []);
        return;
      }
    }

    // Стандартная обработка для обычного текста
    // (не предотвращаем событие, чтобы браузер вставил текст сам)
  };

  return (
    <div className="edit-article-v2__block-wrapper-text">
      <p>
        <RichTextBlockEditor
          content={value}
          onChange={onChange}
          variant="paragraph"
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
          onTextareaChange={markdownDebug ? handleChange : undefined}
          onKeyDown={markdownDebug ? handleKeyDown : undefined}
          onPaste={markdownDebug ? handlePaste : undefined}
          onRichEnter={onRichEnter}
          onRichBackspace={onRichBackspace}
          onRichPasteMultiline={onRichPasteMultiline}
          onBlockFormat={onFormat}
          onFocus={onFocus}
          autoFocusCaret={autoFocusCaret}
          onAutoFocusCaret={onAutoFocusCaret}
          onBlur={(e) => {
            // Скрываем меню при потере фокуса с небольшой задержкой
            // на случай, если пользователь кликает на кнопки меню
            // или вводит ссылку во встроенном поле link-режима.
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
      </p>
      {showFormatMenu && markdownDebug && mode === 'textarea' && (
        <FormatMenu
          textarea={textareaRef.current}
          content={value}
          onFormat={onFormat}
          onClose={() => setShowFormatMenu(false)}
        />
      )}
    </div>
  );
}

export interface FormatMenuProps {
  textarea: HTMLTextAreaElement | null;
  content: RichText;
  onFormat?: (type: FormatType, url?: string) => void;
  onClose: () => void;
  hideBoldItalic?: boolean;
}

function formatMenuItemClass(isActive: boolean, extraClass?: string): string {
  return [
    'edit-article-v2__format-menu-item',
    extraClass,
    isActive ? 'edit-article-v2__format-menu-item--active' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Иконка «ссылка» (цепочка) — повторяет глиф из тулбара ВК. */
function LinkGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 13.5a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
      <path d="M14.5 10.5a4 4 0 0 0-6-.4L6 12.6a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </svg>
  );
}

/** Иконка «крестик» для выхода из режима ввода ссылки. */
function CloseGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function FormatMenu({
  textarea,
  content,
  onFormat,
  onClose,
  hideBoldItalic = false,
}: FormatMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'toolbar' | 'link'>('toolbar');
  const [linkValue, setLinkValue] = useState('');
  const [activeState, setActiveState] = useState<FormatMenuActiveState>(() =>
    emptyFormatMenuActiveState()
  );

  useEffect(() => {
    if (!textarea) return;

    const updatePosition = () => {
      if (!textarea || !menuRef.current) return;

      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Сохраняем позицию выделения
      selectionRef.current = { start: selectionStart, end: selectionEnd };

      setActiveState(
        getFormatMenuActiveState(content, textarea.value, selectionStart, selectionEnd)
      );

      // Если нет выделения, не показываем меню
      if (selectionStart === selectionEnd) {
        onClose();
        return;
      }

      // Создаем временный элемент-измеритель с теми же стилями, что и textarea
      if (!measureRef.current) {
        measureRef.current = document.createElement('div');
        measureRef.current.style.position = 'absolute';
        measureRef.current.style.visibility = 'hidden';
        measureRef.current.style.whiteSpace = 'pre-wrap';
        measureRef.current.style.wordWrap = 'break-word';
        measureRef.current.style.overflow = 'hidden';
        measureRef.current.style.pointerEvents = 'none';
        measureRef.current.style.zIndex = '-1';
        document.body.appendChild(measureRef.current);
      }

      const measure = measureRef.current;
      const textareaRect = textarea.getBoundingClientRect();
      const textareaStyles = getComputedStyle(textarea);

      // Позиционируем измеритель в том же месте, что и textarea
      measure.style.position = 'fixed';
      measure.style.top = `${textareaRect.top}px`;
      measure.style.left = `${textareaRect.left}px`;

      // Копируем все стили из textarea в измеритель
      measure.style.font = textareaStyles.font;
      measure.style.fontSize = textareaStyles.fontSize;
      measure.style.fontFamily = textareaStyles.fontFamily;
      measure.style.fontWeight = textareaStyles.fontWeight;
      measure.style.fontStyle = textareaStyles.fontStyle;
      measure.style.letterSpacing = textareaStyles.letterSpacing;
      measure.style.textTransform = textareaStyles.textTransform;
      measure.style.lineHeight = textareaStyles.lineHeight;
      measure.style.padding = textareaStyles.padding;
      measure.style.border = textareaStyles.border;
      measure.style.boxSizing = textareaStyles.boxSizing;
      measure.style.width = `${textarea.offsetWidth}px`;
      measure.style.maxWidth = `${textarea.offsetWidth}px`;

      // Получаем текст до начала выделения и сам выделенный текст
      const textBefore = textarea.value.substring(0, selectionStart);
      const selectedText = textarea.value.substring(selectionStart, selectionEnd);

      // Очищаем измеритель
      measure.innerHTML = '';

      // Создаем текстовый узел для текста до выделения
      const beforeText = document.createTextNode(textBefore);
      measure.appendChild(beforeText);

      // Создаем span для выделенного текста
      const selectedSpan = document.createElement('span');
      selectedSpan.textContent = selectedText;
      measure.appendChild(selectedSpan);

      // Принудительно пересчитываем layout
      void measure.offsetHeight; // Force reflow

      // Получаем позицию выделения
      const startRect = selectedSpan.getBoundingClientRect();

      // Вычисляем позицию тултипа: по центру выделения по горизонтали, над выделением по вертикали
      const menuWidth = menuRef.current.offsetWidth || 120;
      const menuHeight = menuRef.current.offsetHeight || 40;
      const offsetY = 8; // Отступ сверху от выделения

      // Центрируем по горизонтали относительно выделения
      const selectionCenterX = startRect.left + startRect.width / 2;
      const left = selectionCenterX - menuWidth / 2;
      // Позиционируем над выделением
      const top = startRect.top - menuHeight - offsetY;

      // Проверяем, не выходит ли меню за границы viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8;

      let finalLeft = left;
      let finalTop = top;

      // Если меню выходит за левую границу
      if (finalLeft < padding) {
        finalLeft = padding;
      }
      // Если меню выходит за правую границу
      if (finalLeft + menuWidth > viewportWidth - padding) {
        finalLeft = viewportWidth - menuWidth - padding;
      }

      // Если меню выходит за верхнюю границу, показываем его под выделением
      if (finalTop < padding) {
        finalTop = startRect.bottom + offsetY;
      }
      // Если меню выходит за нижнюю границу, показываем его над выделением (даже если частично скрыто)
      if (finalTop + menuHeight > viewportHeight - padding) {
        finalTop = Math.max(padding, startRect.top - menuHeight - offsetY);
      }

      menuRef.current.style.top = `${finalTop}px`;
      menuRef.current.style.left = `${finalLeft}px`;
    };

    // Используем requestAnimationFrame для корректного обновления позиции после изменения выделения
    const updatePositionWithRAF = () => {
      requestAnimationFrame(() => {
        updatePosition();
      });
    };

    updatePositionWithRAF();

    // Обновляем позицию при скролле и изменении размера окна
    const handleScroll = () => updatePositionWithRAF();
    const handleResize = () => updatePositionWithRAF();
    const handleSelectionChange = () => updatePositionWithRAF();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('selectionchange', handleSelectionChange);
      // Удаляем измеритель при размонтировании
      if (measureRef.current && measureRef.current.parentNode) {
        measureRef.current.parentNode.removeChild(measureRef.current);
        measureRef.current = null;
      }
    };
  }, [textarea, onClose, mode, content]);

  // При входе в режим ввода ссылки автофокусируем встроенное поле.
  useEffect(() => {
    if (mode === 'link') {
      requestAnimationFrame(() => {
        linkInputRef.current?.focus();
      });
    }
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Восстанавливаем выделение в textarea (оно визуально сохраняется,
  // но фокус мог уйти на кнопку/поле ввода тулбара).
  const restoreSelection = () => {
    if (textarea && selectionRef.current) {
      textarea.focus();
      textarea.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
    }
  };

  const applyFormat = (type: FormatType) => {
    restoreSelection();
    onFormat?.(type);
    onClose();
  };

  const openLinkMode = () => {
    // Фиксируем текущее выделение, чтобы применить ссылку после ввода URL.
    if (textarea) {
      selectionRef.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
      const state = getFormatMenuActiveState(
        content,
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd
      );
      setLinkValue(state.linkHref ?? '');
    } else {
      setLinkValue('');
    }
    setMode('link');
  };

  const confirmLink = () => {
    const url = linkValue.trim();
    if (!url) {
      setMode('toolbar');
      return;
    }
    restoreSelection();
    onFormat?.('link', url);
    onClose();
  };

  // Общие обработчики для кнопок: не теряем выделение textarea при клике.
  const keepSelection = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={menuRef}
      className={`edit-article-v2__format-menu${
        mode === 'link' ? ' edit-article-v2__format-menu--link' : ''
      }`}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {mode === 'toolbar' ? (
        <>
          {!hideBoldItalic && (
            <>
              <button
                type="button"
                className={formatMenuItemClass(activeState.isBoldActive)}
                aria-pressed={activeState.isBoldActive}
                onMouseDown={keepSelection}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyFormat('bold');
                }}
                title="Жирный (Ctrl+B)"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className={formatMenuItemClass(activeState.isItalicActive)}
                aria-pressed={activeState.isItalicActive}
                onMouseDown={keepSelection}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyFormat('italic');
                }}
                title="Курсив (Ctrl+I)"
              >
                <em>I</em>
              </button>
            </>
          )}
          <button
            type="button"
            className={formatMenuItemClass(activeState.isStrikeActive)}
            aria-pressed={activeState.isStrikeActive}
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat('strikethrough');
            }}
            title="Зачёркнутый"
          >
            <s>S</s>
          </button>
          <button
            type="button"
            className={formatMenuItemClass(activeState.isLinkActive)}
            aria-pressed={activeState.isLinkActive}
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openLinkMode();
            }}
            title="Ссылка (Ctrl+K)"
          >
            <LinkGlyph />
          </button>

          <span className="edit-article-v2__format-menu-divider" aria-hidden="true" />

          <button
            type="button"
            className="edit-article-v2__format-menu-item edit-article-v2__format-menu-item--h1"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat('heading-large');
            }}
            title="Большой заголовок"
            aria-label="Большой заголовок"
          >
            <span>H</span>
          </button>
          <button
            type="button"
            className="edit-article-v2__format-menu-item edit-article-v2__format-menu-item--h2"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat('heading-small');
            }}
            title="Малый заголовок"
            aria-label="Малый заголовок"
          >
            <span>H</span>
          </button>

          <span className="edit-article-v2__format-menu-divider" aria-hidden="true" />

          <button
            type="button"
            className="edit-article-v2__format-menu-item"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat('quote');
            }}
            title="Цитата"
          >
            <TextQuoteIcon {...dashboardActionIconProps({ size: 18 })} />
          </button>
        </>
      ) : (
        <div className="edit-article-v2__format-menu-link-field">
          <input
            ref={linkInputRef}
            type="text"
            className="edit-article-v2__format-menu-link-input"
            placeholder="Введите ссылку"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setMode('toolbar');
              }
            }}
          />
          <button
            type="button"
            className="edit-article-v2__format-menu-link-close"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMode('toolbar');
            }}
            aria-label="Отменить ввод ссылки"
            title="Отменить"
          >
            <CloseGlyph />
          </button>
        </div>
      )}
    </div>
  );
}
