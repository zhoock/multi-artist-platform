import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type Ref,
} from 'react';

import type { InlineMark, InlineMarkType, RichText } from '@shared/lib/richText';
import {
  getActiveMarks,
  getLinkAtSelection,
  getSelectionOffsets,
  insertText,
  normalizeRichText,
  removeLink,
  renderRichText,
  restoreSelection,
  richTextToPlainText,
  setLink,
  splitRichTextAt,
  toggleMark,
  type SelectionOffsets,
} from '@shared/lib/richText';

import { useLocalMarkdownBuffer } from '@shared/lib/richText/useLocalMarkdownBuffer';

import './RichTextBlockEditor.style.scss';

export type RichTextBlockEditorMode = 'textarea' | 'preview' | 'rich';

export type RichTextBlockEditorProps = {
  content: RichText;
  onChange: (content: RichText) => void;
  editable?: boolean;
  mode?: RichTextBlockEditorMode;
  onModeChange?: (mode: RichTextBlockEditorMode) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  textareaClassName?: string;
  richClassName?: string;
  blockId?: string;
  placeholder?: string;
  rows?: number;
  onFocus?: () => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaChange?: (markdown: string, event: ChangeEvent<HTMLTextAreaElement>) => void;
};

const MODE_LABELS: Record<RichTextBlockEditorMode, string> = {
  textarea: 'Markdown',
  preview: 'Preview',
  rich: 'Rich',
};

const MODE_ORDER: RichTextBlockEditorMode[] = ['textarea', 'preview', 'rich'];

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref && typeof ref === 'object') {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

/**
 * Удаляет плоский диапазон [from, to) из RichText, сохраняя marks остального
 * текста. Композиция splitRichTextAt — без правок operations.ts.
 */
function deleteRange(content: RichText, from: number, to: number): RichText {
  if (from === to) return content;
  const before = splitRichTextAt(content, from)[0];
  const after = splitRichTextAt(content, to)[1];
  return normalizeRichText([...before, ...after]);
}

type RichToolbarState = {
  from: number;
  to: number;
  rect: DOMRect;
};

export function RichTextBlockEditor({
  content,
  onChange,
  editable = true,
  mode,
  onModeChange,
  textareaRef,
  textareaClassName,
  richClassName,
  blockId,
  placeholder,
  rows = 1,
  onFocus,
  onBlur,
  onKeyDown,
  onPaste,
  onTextareaChange,
}: RichTextBlockEditorProps) {
  const [internalMode, setInternalMode] = useState<RichTextBlockEditorMode>('textarea');
  const isModeControlled = mode !== undefined;
  const currentMode = isModeControlled ? mode : internalMode;

  const textareaInternalRef = useRef<HTMLTextAreaElement | null>(
    null
  ) as MutableRefObject<HTMLTextAreaElement | null>;
  const editableRef = useRef<HTMLDivElement | null>(null);

  // Последние значения content/onChange для нативных слушателей contentEditable,
  // привязанных один раз (deps [currentMode]).
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Каретка/выделение, которое нужно восстановить после очередного onChange
  // (rich-режим: ввод/удаление/форматирование меняют content → перерисовка).
  const pendingSelectionRef = useRef<SelectionOffsets | null>(null);

  const [richToolbar, setRichToolbar] = useState<RichToolbarState | null>(null);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const linkEditingRef = useRef(linkEditing);
  linkEditingRef.current = linkEditing;

  const { localMarkdown, handleChange: handleMarkdownChange } = useLocalMarkdownBuffer(
    content,
    onChange
  );

  const setMode = (next: RichTextBlockEditorMode) => {
    if (!isModeControlled) {
      setInternalMode(next);
    }
    onModeChange?.(next);
  };

  // Автоувеличение высоты textarea.
  useEffect(() => {
    if (currentMode !== 'textarea') return;
    const textarea = textareaInternalRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [localMarkdown, currentMode]);

  // Сброс floating-тулбара при выходе из rich-режима.
  useEffect(() => {
    if (currentMode !== 'rich') {
      setRichToolbar(null);
      setLinkEditing(false);
    }
  }, [currentMode]);

  // contentEditable engine: перехватываем beforeinput и применяем правки к
  // RichText-модели (ввод текста / удаление символов). Всё остальное (Enter,
  // paste, IME, форматные команды браузера) пока запрещаем.
  useEffect(() => {
    if (currentMode !== 'rich' || !editable) return;
    const root = editableRef.current;
    if (!root) return;

    const handler = (event: InputEvent) => {
      const inputType = event.inputType;
      const model = contentRef.current;

      if (inputType === 'insertText') {
        event.preventDefault();
        const data = event.data ?? '';
        if (!data) return;
        const selection = getSelectionOffsets(root);
        if (!selection) return;
        const cleared =
          selection.from === selection.to
            ? model
            : deleteRange(model, selection.from, selection.to);
        const next = insertText(cleared, selection.from, data);
        const caret = selection.from + data.length;
        pendingSelectionRef.current = { from: caret, to: caret };
        onChangeRef.current(next);
        return;
      }

      if (inputType.startsWith('delete')) {
        event.preventDefault();
        const range = resolveDeleteRange(root, event, model, inputType);
        if (!range || range.from === range.to) return;
        const next = deleteRange(model, range.from, range.to);
        pendingSelectionRef.current = { from: range.from, to: range.from };
        onChangeRef.current(next);
        return;
      }

      // Enter, вставка, IME, форматные команды и т.п. — пока не поддерживаются.
      event.preventDefault();
    };

    root.addEventListener('beforeinput', handler);
    return () => root.removeEventListener('beforeinput', handler);
  }, [currentMode, editable]);

  // Восстанавливаем выделение после перерисовки, вызванной нашей же правкой.
  useLayoutEffect(() => {
    if (currentMode !== 'rich') return;
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;
    const root = editableRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    restoreSelection(root, pending.from, pending.to);
  }, [content, currentMode]);

  // Floating-тулбар: показываем при непустом выделении внутри contentEditable.
  useEffect(() => {
    if (currentMode !== 'rich') return;
    const root = editableRef.current;
    if (!root) return;

    const update = () => {
      if (linkEditingRef.current) return; // не прячем тулбар во время ввода ссылки
      const selection = root.ownerDocument.getSelection?.() ?? window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setRichToolbar(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setRichToolbar(null);
        return;
      }
      const offsets = getSelectionOffsets(root);
      if (!offsets || offsets.from === offsets.to) {
        setRichToolbar(null);
        return;
      }
      setRichToolbar({ from: offsets.from, to: offsets.to, rect: range.getBoundingClientRect() });
    };

    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [currentMode]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    handleMarkdownChange(event.target.value);
    onTextareaChange?.(event.target.value, event);
  };

  const emitWithSelection = (next: RichText, from: number, to: number) => {
    pendingSelectionRef.current = { from, to };
    onChange(next);
  };

  const applyMark = (markType: InlineMarkType) => {
    if (!richToolbar) return;
    const { from, to } = richToolbar;
    emitWithSelection(toggleMark(content, from, to, { type: markType } as InlineMark), from, to);
  };

  const handleLinkButton = () => {
    if (!richToolbar) return;
    const { from, to } = richToolbar;
    const existing = getLinkAtSelection(content, from, to);
    if (existing) {
      emitWithSelection(removeLink(content, from, to), from, to);
      return;
    }
    setLinkValue('');
    setLinkEditing(true);
  };

  const confirmLink = () => {
    setLinkEditing(false);
    if (!richToolbar) return;
    const { from, to } = richToolbar;
    const url = linkValue.trim();
    if (!url) return;
    emitWithSelection(setLink(content, from, to, url), from, to);
  };

  const keepSelection = (event: MouseEvent) => {
    event.preventDefault();
  };

  const previewContent = renderRichText(content);
  const activeMarks = richToolbar
    ? getActiveMarks(content, richToolbar.from, richToolbar.to)
    : new Set<InlineMarkType>();

  return (
    <div className="rich-text-block-editor">
      {editable && (
        <div className="rich-text-block-editor__modes" role="group" aria-label="Режим блока">
          {MODE_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              className={[
                'rich-text-block-editor__mode',
                currentMode === value ? 'rich-text-block-editor__mode--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={currentMode === value}
              onMouseDown={keepSelection}
              onClick={() => setMode(value)}
            >
              {MODE_LABELS[value]}
            </button>
          ))}
        </div>
      )}

      {currentMode === 'rich' ? (
        <>
          <div
            ref={editableRef}
            className={['rich-text-block-editor__rich', richClassName].filter(Boolean).join(' ')}
            data-block-id={blockId}
            data-testid="rich-text-block-editor-rich"
            data-placeholder={placeholder}
            contentEditable={editable}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            onFocus={onFocus}
          >
            {previewContent}
          </div>

          {richToolbar && (
            <div
              className="rich-text-block-editor__toolbar"
              style={{
                top: `${richToolbar.rect.top}px`,
                left: `${richToolbar.rect.left + richToolbar.rect.width / 2}px`,
              }}
              onMouseDown={keepSelection}
            >
              {linkEditing ? (
                <div className="rich-text-block-editor__toolbar-link">
                  <input
                    autoFocus
                    type="text"
                    className="rich-text-block-editor__toolbar-link-input"
                    placeholder="Введите ссылку"
                    value={linkValue}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => setLinkValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmLink();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setLinkEditing(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    onMouseDown={keepSelection}
                    onClick={confirmLink}
                  >
                    OK
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('bold')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('bold')}
                    title="Жирный"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('italic')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('italic')}
                    title="Курсив"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('underline')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('underline')}
                    title="Подчёркнутый"
                  >
                    <u>U</u>
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('strike')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('strike')}
                    title="Зачёркнутый"
                  >
                    <s>S</s>
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('link')}
                    onMouseDown={keepSelection}
                    onClick={handleLinkButton}
                    title="Ссылка"
                  >
                    Link
                  </button>
                </>
              )}
            </div>
          )}
        </>
      ) : currentMode === 'preview' ? (
        <div
          className="rich-text-block-editor__preview"
          data-testid="rich-text-block-editor-preview"
        >
          {previewContent ?? (
            <span className="rich-text-block-editor__preview-empty">{placeholder}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={(node) => {
            textareaInternalRef.current = node;
            assignRef(textareaRef, node);
          }}
          className={['rich-text-block-editor__textarea', textareaClassName]
            .filter(Boolean)
            .join(' ')}
          data-block-id={blockId}
          value={localMarkdown}
          onChange={handleTextareaChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          readOnly={!editable}
        />
      )}
    </div>
  );
}

/**
 * Диапазон, который браузер собирается удалить. Предпочитаем нативный
 * getTargetRanges() (корректно для слов/выделения), иначе — fallback на текущее
 * выделение и один символ для backward/forward.
 */
function resolveDeleteRange(
  root: HTMLElement,
  event: InputEvent,
  model: RichText,
  inputType: string
): SelectionOffsets | null {
  const targetRanges = typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : [];
  if (targetRanges.length > 0) {
    const range = targetRanges[0];
    const a = pointToOffsetSafe(root, range.startContainer, range.startOffset);
    const b = pointToOffsetSafe(root, range.endContainer, range.endOffset);
    return a <= b ? { from: a, to: b } : { from: b, to: a };
  }

  const selection = getSelectionOffsets(root);
  if (!selection) return null;
  if (selection.from !== selection.to) return selection;

  const length = richTextToPlainText(model).length;
  if (inputType === 'deleteContentForward') {
    return { from: selection.from, to: Math.min(selection.from + 1, length) };
  }
  return { from: Math.max(selection.from - 1, 0), to: selection.from };
}

// Локальная обёртка, чтобы не тянуть pointToOffset в публичную поверхность тут.
function pointToOffsetSafe(root: HTMLElement, node: Node, offset: number): number {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}
