import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type Ref,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  Bold as BoldIcon,
  Check as CheckIcon,
  Italic as ItalicIcon,
  Link as LinkIcon,
  Strikethrough as StrikethroughIcon,
  TextQuote as TextQuoteIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import type { InlineMark, InlineMarkType, RichText } from '@shared/lib/richText';
import {
  getActiveMarks,
  getLinkAtSelection,
  getSelectionOffsets,
  isRichTextEmpty,
  pointToOffset,
  removeLink,
  renderRichText,
  restoreSelection,
  richTextToPlainText,
  setLink,
  splitRichTextAt,
  toggleMark,
} from '@shared/lib/richText';
import {
  applyPlainTextInsert,
  deleteRange,
  planMultilinePaste,
  type SelectionOffsets,
} from '@shared/lib/richText/richInput';

import {
  getDefaultEditorMode,
  getVisibleEditorModes,
  isMarkdownEditorEnabled,
  type RichTextBlockEditorMode,
} from '@shared/lib/richText/editorConfig';

import { useLocalMarkdownBuffer } from '@shared/lib/richText/useLocalMarkdownBuffer';

import './RichTextBlockEditor.style.scss';

export type { RichTextBlockEditorMode };

export type RichBlockFormatType = 'heading-large' | 'heading-small' | 'quote';

export type RichTextBlockEditorVariant = 'paragraph' | 'title' | 'subtitle' | 'quote' | 'list-item';

const VARIANT_BLOCK_CLASS: Record<RichTextBlockEditorVariant, string> = {
  paragraph: 'edit-article-v2__block edit-article-v2__block--paragraph',
  title: 'edit-article-v2__block edit-article-v2__block--title',
  subtitle: 'edit-article-v2__block edit-article-v2__block--subtitle',
  quote: 'edit-article-v2__block edit-article-v2__block--quote',
  'list-item': 'edit-article-v2__block',
};

export type RichEnterDetail = {
  atEnd: boolean;
  offset: number;
  after?: RichText;
};

export type RichBackspaceDetail = {
  isEmpty: boolean;
  atStart: boolean;
};

export type RichPasteMultilineDetail = {
  leadingContent: RichText;
  middleBlocks: RichText[];
  trailingContent: RichText;
  focusOffset: number;
};

export type RichTextBlockEditorProps = {
  content: RichText;
  onChange: (content: RichText) => void;
  variant?: RichTextBlockEditorVariant;
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
  onRichEnter?: (detail: RichEnterDetail) => void;
  onRichBackspace?: (detail: RichBackspaceDetail) => void;
  onRichPasteMultiline?: (detail: RichPasteMultilineDetail) => void;
  onBlockFormat?: (type: RichBlockFormatType) => void;
  /** После mount — фокус и каретка в начале (rich/textarea). */
  autoFocusCaret?: boolean;
  onAutoFocusCaret?: () => void;
};

const TOOLBAR_ICON_PROPS = dashboardActionIconProps({ size: 16 });

const MODE_LABELS: Record<RichTextBlockEditorMode, string> = {
  textarea: 'Markdown',
  preview: 'Preview',
  rich: 'Rich',
};

function getModeOrder(): RichTextBlockEditorMode[] {
  return getVisibleEditorModes();
}

const BLOCKED_INPUT_TYPES = new Set([
  'historyUndo',
  'historyRedo',
  'formatBold',
  'formatItalic',
  'formatUnderline',
  'formatStrikeThrough',
  'formatInsertLink',
]);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref && typeof ref === 'object') {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

function isBlockedBrowserInput(inputType: string): boolean {
  return (
    BLOCKED_INPUT_TYPES.has(inputType) ||
    inputType.startsWith('history') ||
    inputType.startsWith('format')
  );
}

type RichToolbarState = {
  from: number;
  to: number;
  rect: DOMRect;
};

export function RichTextBlockEditor({
  content,
  onChange,
  variant = 'paragraph',
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
  onRichEnter,
  onRichBackspace,
  onRichPasteMultiline,
  onBlockFormat,
  autoFocusCaret = false,
  onAutoFocusCaret,
}: RichTextBlockEditorProps) {
  const [internalMode, setInternalMode] = useState<RichTextBlockEditorMode>(getDefaultEditorMode);
  const isModeControlled = mode !== undefined;
  const currentMode = isModeControlled ? mode : internalMode;

  const textareaInternalRef = useRef<HTMLTextAreaElement | null>(
    null
  ) as MutableRefObject<HTMLTextAreaElement | null>;
  const editableRef = useRef<HTMLDivElement | null>(null);
  const richRootRef = useRef<Root | null>(null);
  const isComposingRef = useRef(false);
  const compositionRangeRef = useRef<SelectionOffsets | null>(null);

  const contentRef = useRef(content);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRichEnterRef = useRef(onRichEnter);
  onRichEnterRef.current = onRichEnter;
  const onRichBackspaceRef = useRef(onRichBackspace);
  onRichBackspaceRef.current = onRichBackspace;
  const onRichPasteMultilineRef = useRef(onRichPasteMultiline);
  onRichPasteMultilineRef.current = onRichPasteMultiline;

  const pendingSelectionRef = useRef<SelectionOffsets | null>(null);
  const lastSyncedPlainRef = useRef<string | null>(null);
  const toolbarSelectionRef = useRef<SelectionOffsets | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const suppressToolbarDismissRef = useRef(false);
  /** Plain text already flushed to DOM before parent props catch up. */
  const optimisticPlainRef = useRef<string | null>(null);
  const toolbarVisibleRef = useRef(false);
  const autoFocusHandledRef = useRef(false);

  const [richToolbar, setRichToolbar] = useState<RichToolbarState | null>(null);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const linkEditingRef = useRef(linkEditing);
  linkEditingRef.current = linkEditing;
  toolbarVisibleRef.current = richToolbar != null;

  const { localMarkdown, handleChange: handleMarkdownChange } = useLocalMarkdownBuffer(
    content,
    onChange
  );

  const setMode = (next: RichTextBlockEditorMode) => {
    if (!isMarkdownEditorEnabled() && next === 'textarea') {
      next = 'rich';
    }
    if (!isModeControlled) {
      setInternalMode(next);
    }
    onModeChange?.(next);
  };

  useEffect(() => {
    if (isModeControlled) return;
    if (isMarkdownEditorEnabled() || currentMode !== 'textarea') return;
    setInternalMode('rich');
    onModeChange?.('rich');
  }, [currentMode, isModeControlled, onModeChange]);

  useEffect(() => {
    if (currentMode !== 'textarea') return;
    const textarea = textareaInternalRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [localMarkdown, currentMode]);

  useEffect(() => {
    if (currentMode !== 'rich') {
      setRichToolbar(null);
      setLinkEditing(false);
      toolbarSelectionRef.current = null;
      richRootRef.current?.unmount();
      richRootRef.current = null;
      lastSyncedPlainRef.current = null;
    }
  }, [currentMode]);

  const closeToolbar = () => {
    setRichToolbar(null);
    setLinkEditing(false);
    toolbarSelectionRef.current = null;
    toolbarVisibleRef.current = false;
  };

  const updateToolbarRect = (from: number, to: number) => {
    const root = editableRef.current;
    if (!root) return;
    const selection = root.ownerDocument.getSelection?.() ?? window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !root.contains(range.commonAncestorContainer)) return;
    toolbarSelectionRef.current = { from, to };
    toolbarVisibleRef.current = true;
    setRichToolbar({ from, to, rect: range.getBoundingClientRect() });
  };

  const maintainToolbarSelection = (from: number, to: number) => {
    const root = editableRef.current;
    if (!root) return;
    restoreSelection(root, from, to);
    updateToolbarRect(from, to);
  };

  const scheduleSelection = (from: number, to: number = from) => {
    pendingSelectionRef.current = { from, to };
  };

  const syncRichDom = (next: RichText, caret: number | null): boolean => {
    const root = editableRef.current;
    if (currentMode !== 'rich' || !editable || !root || isComposingRef.current) {
      return false;
    }

    if (!richRootRef.current) {
      richRootRef.current = createRoot(root);
    }

    flushSync(() => {
      richRootRef.current!.render(<>{renderRichText(next)}</>);
    });

    lastSyncedPlainRef.current = richTextToPlainText(next);
    optimisticPlainRef.current = lastSyncedPlainRef.current;

    if (caret != null) {
      root.focus({ preventScroll: true });
      restoreSelection(root, caret, caret);
    }

    return true;
  };

  const emitContent = (next: RichText, from: number, to: number = from) => {
    const caret = Math.min(from, richTextToPlainText(next).length);
    contentRef.current = next;

    if (syncRichDom(next, caret)) {
      pendingSelectionRef.current = null;
    } else {
      scheduleSelection(caret, caret);
    }

    onChangeRef.current(next);
  };

  const handleRichEnter = (root: HTMLElement, model: RichText) => {
    const selection = getSelectionOffsets(root);
    if (!selection) return;
    const plainLen = richTextToPlainText(model).length;

    if (selection.from === plainLen && selection.to === plainLen) {
      onRichEnterRef.current?.({ atEnd: true, offset: plainLen });
      return;
    }

    const [before, after] = splitRichTextAt(model, selection.from);
    onChangeRef.current(before);
    onRichEnterRef.current?.({ atEnd: false, offset: selection.from, after });
  };

  const handleRichSoftBreak = (root: HTMLElement, model: RichText) => {
    const selection = getSelectionOffsets(root);
    if (!selection) return;
    const { content: next, caret } = applyPlainTextInsert(model, '\n', selection);
    emitContent(next, caret, caret);
  };

  const handleRichBackspaceAtStart = (model: RichText) => {
    onRichBackspaceRef.current?.({
      isEmpty: isRichTextEmpty(model),
      atStart: true,
    });
  };

  const handlePastePlainText = (root: HTMLElement, model: RichText, text: string) => {
    const selection = getSelectionOffsets(root);
    if (!selection) return;

    const multilinePlan = planMultilinePaste(model, text, selection);
    if (multilinePlan) {
      onChangeRef.current(multilinePlan.leadingContent);
      onRichPasteMultilineRef.current?.({
        leadingContent: multilinePlan.leadingContent,
        middleBlocks: multilinePlan.middleBlocks,
        trailingContent: multilinePlan.trailingContent,
        focusOffset: multilinePlan.focusOffset,
      });
      return;
    }

    const { content: next, caret } = applyPlainTextInsert(model, text, selection);
    emitContent(next, caret, caret);
  };

  useEffect(() => {
    if (!autoFocusCaret) {
      autoFocusHandledRef.current = false;
    }
  }, [autoFocusCaret]);

  useLayoutEffect(() => {
    if (!autoFocusCaret || autoFocusHandledRef.current || !editable) return;

    const completeAutoFocus = () => {
      autoFocusHandledRef.current = true;
      onAutoFocusCaret?.();
    };

    const applyAutoFocus = (): boolean => {
      if (currentMode === 'textarea') {
        const textarea = textareaInternalRef.current;
        if (!textarea) return false;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(0, 0);
        return document.activeElement === textarea;
      }

      if (currentMode !== 'rich') return false;
      const root = editableRef.current;
      if (!root) return false;

      if (!richRootRef.current) {
        richRootRef.current = createRoot(root);
      }

      flushSync(() => {
        richRootRef.current!.render(<>{renderRichText(content)}</>);
      });
      lastSyncedPlainRef.current = richTextToPlainText(content);
      contentRef.current = content;

      root.focus({ preventScroll: true });
      restoreSelection(root, 0, 0);
      return document.activeElement === root;
    };

    const tryApply = () => {
      if (autoFocusHandledRef.current) return;
      if (applyAutoFocus()) {
        completeAutoFocus();
      }
    };

    tryApply();
    const retrySoon = setTimeout(tryApply, 0);
    const retryLater = setTimeout(tryApply, 50);

    return () => {
      clearTimeout(retrySoon);
      clearTimeout(retryLater);
    };
  }, [autoFocusCaret, currentMode, editable, content, onAutoFocusCaret]);

  // Rich DOM sync + selection restore (createRoot — не ломаем IME перерисовкой React children).
  useLayoutEffect(() => {
    if (currentMode !== 'rich' || !editable) return;
    const root = editableRef.current;
    if (!root) return;

    if (!richRootRef.current) {
      richRootRef.current = createRoot(root);
    }

    const plain = richTextToPlainText(content);
    const pending = pendingSelectionRef.current;
    const synced = lastSyncedPlainRef.current;
    const optimistic = optimisticPlainRef.current;

    if (optimistic !== null && plain === optimistic) {
      optimisticPlainRef.current = null;
    }

    const propsAreStale = optimistic !== null && plain !== optimistic;

    if (!propsAreStale) {
      contentRef.current = content;
    }

    if (!isComposingRef.current && !propsAreStale && (plain !== synced || pending)) {
      if (plain !== synced) {
        richRootRef.current.render(<>{renderRichText(content)}</>);
        lastSyncedPlainRef.current = plain;
      }
    }

    if (pending && !isComposingRef.current) {
      pendingSelectionRef.current = null;
      root.focus({ preventScroll: true });
      const caret = Math.min(pending.from, plain.length);
      queueMicrotask(() => {
        if (editableRef.current !== root) return;
        restoreSelection(root, caret, caret);
      });
    }
  }, [content, currentMode, editable]);

  // contentEditable engine
  useEffect(() => {
    if (currentMode !== 'rich' || !editable) return;
    const root = editableRef.current;
    if (!root) return;

    const handler = (event: InputEvent) => {
      if (isComposingRef.current) return;

      const inputType = event.inputType;

      if (isBlockedBrowserInput(inputType)) {
        event.preventDefault();
        return;
      }

      const model = contentRef.current;

      if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
        // Enter / Shift+Enter обрабатываются только в keydown.
        event.preventDefault();
        return;
      }

      if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
        event.preventDefault();
        const text = event.data ?? '';
        if (text) handlePastePlainText(root, model, text);
        return;
      }

      if (inputType === 'insertText') {
        event.preventDefault();
        const data = event.data ?? '';
        if (!data) return;
        const selection = getSelectionOffsets(root);
        if (!selection) return;
        const { content: next, caret } = applyPlainTextInsert(model, data, selection);
        emitContent(next, caret, caret);
        return;
      }

      if (inputType.startsWith('delete')) {
        event.preventDefault();
        const range = resolveDeleteRange(root, event, model, inputType);
        if (!range) return;

        if (range.from === 0 && range.to === 0) {
          handleRichBackspaceAtStart(model);
          return;
        }

        if (range.from === range.to) return;
        const next = deleteRange(model, range.from, range.to);
        const caret = Math.min(range.from, richTextToPlainText(next).length);
        emitContent(next, caret, caret);
        return;
      }

      event.preventDefault();
    };

    const handlePaste = (event: Event) => {
      if (isComposingRef.current) return;
      event.preventDefault();
      const clip = event as globalThis.ClipboardEvent;

      const items = Array.from(clip.clipboardData?.items ?? []);
      const hasImage = items.some((item) => item.type.startsWith('image/'));
      if (hasImage) return;

      const text = clip.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      handlePastePlainText(root, contentRef.current, text);
    };

    root.addEventListener('beforeinput', handler);
    root.addEventListener('paste', handlePaste);

    const handleEnterKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || isComposingRef.current) return;

      event.preventDefault();
      if (event.shiftKey) {
        handleRichSoftBreak(root, contentRef.current);
      } else {
        handleRichEnter(root, contentRef.current);
      }
    };

    root.addEventListener('keydown', handleEnterKey);
    return () => {
      root.removeEventListener('beforeinput', handler);
      root.removeEventListener('paste', handlePaste);
      root.removeEventListener('keydown', handleEnterKey);
    };
  }, [currentMode, editable]);

  // Rich keyboard shortcuts (Ctrl/Cmd+B/I/K/U)
  useEffect(() => {
    if (currentMode !== 'rich' || !editable) return;
    const root = editableRef.current;
    if (!root) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'b' && key !== 'i' && key !== 'k' && key !== 'u') return;

      const selection = getSelectionOffsets(root);
      if (!selection) return;

      event.preventDefault();
      const { from, to } = selection;
      const model = contentRef.current;

      if (key === 'k') {
        const existing = getLinkAtSelection(model, from, to);
        if (existing) {
          emitContent(removeLink(model, from, to), from, to);
          maintainToolbarSelection(from, to);
        } else {
          setLinkValue('');
          setLinkEditing(true);
          toolbarSelectionRef.current = { from, to };
          updateToolbarRect(from, to);
        }
        return;
      }

      const markType =
        key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
      if (!markType) return;
      emitContent(toggleMark(model, from, to, { type: markType } as InlineMark), from, to);
      maintainToolbarSelection(from, to);
    };

    root.addEventListener('keydown', handleKeyDown);
    return () => root.removeEventListener('keydown', handleKeyDown);
  }, [currentMode, editable]);

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    const root = editableRef.current;
    if (root) {
      compositionRangeRef.current = getSelectionOffsets(root);
    }
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLDivElement>) => {
    isComposingRef.current = false;
    const range = compositionRangeRef.current;
    compositionRangeRef.current = null;

    const data = event.data;
    if (!range || !data) return;

    const base =
      range.from === range.to
        ? contentRef.current
        : deleteRange(contentRef.current, range.from, range.to);
    const { content: next, caret } = applyPlainTextInsert(base, data, {
      from: range.from,
      to: range.from,
    });
    emitContent(next, caret, caret);
  };

  useEffect(() => {
    if (currentMode !== 'rich') return;
    const root = editableRef.current;
    if (!root) return;

    const update = () => {
      if (linkEditingRef.current || isComposingRef.current || suppressToolbarDismissRef.current) {
        return;
      }

      const selection = root.ownerDocument.getSelection?.() ?? window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        if (toolbarVisibleRef.current) closeToolbar();
        return;
      }

      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        if (toolbarVisibleRef.current) closeToolbar();
        return;
      }

      const offsets = getSelectionOffsets(root);
      if (!offsets || offsets.from === offsets.to) {
        if (toolbarVisibleRef.current) closeToolbar();
        return;
      }

      updateToolbarRect(offsets.from, offsets.to);
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

  useEffect(() => {
    if (currentMode !== 'rich' || !richToolbar) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (suppressToolbarDismissRef.current) return;

      const target = event.target as Node;
      const root = editableRef.current;
      if (root?.contains(target)) return;
      if (toolbarRef.current?.contains(target)) return;
      closeToolbar();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (linkEditingRef.current) {
        event.preventDefault();
        setLinkEditing(false);
        return;
      }
      if (richToolbar) {
        event.preventDefault();
        closeToolbar();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentMode, richToolbar]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    handleMarkdownChange(event.target.value);
    onTextareaChange?.(event.target.value, event);
  };

  const applyMark = (markType: InlineMarkType) => {
    const selection = toolbarSelectionRef.current;
    if (!selection) return;

    const { from, to } = selection;
    suppressToolbarDismissRef.current = true;
    emitContent(
      toggleMark(contentRef.current, from, to, { type: markType } as InlineMark),
      from,
      to
    );
    maintainToolbarSelection(from, to);
    suppressToolbarDismissRef.current = false;
  };

  const handleLinkButton = () => {
    const selection = toolbarSelectionRef.current;
    if (!selection) return;

    const { from, to } = selection;
    const existing = getLinkAtSelection(contentRef.current, from, to);
    if (existing) {
      suppressToolbarDismissRef.current = true;
      emitContent(removeLink(contentRef.current, from, to), from, to);
      maintainToolbarSelection(from, to);
      suppressToolbarDismissRef.current = false;
      return;
    }

    setLinkValue('');
    setLinkEditing(true);
  };

  const confirmLink = () => {
    const selection = toolbarSelectionRef.current;
    if (!selection) return;

    const { from, to } = selection;
    const url = linkValue.trim();
    setLinkEditing(false);
    if (!url) return;

    suppressToolbarDismissRef.current = true;
    emitContent(setLink(contentRef.current, from, to, url), from, to);
    maintainToolbarSelection(from, to);
    suppressToolbarDismissRef.current = false;
  };

  const handleBlockFormat = (type: RichBlockFormatType) => {
    const selection = toolbarSelectionRef.current;
    if (!selection || !onBlockFormat) return;

    suppressToolbarDismissRef.current = true;
    onBlockFormat(type);
    queueMicrotask(() => {
      suppressToolbarDismissRef.current = false;
    });
  };

  const keepSelection = (event: MouseEvent) => {
    event.preventDefault();
  };

  const selectionForMarks = toolbarSelectionRef.current ?? richToolbar;
  const activeMarks = selectionForMarks
    ? getActiveMarks(contentRef.current, selectionForMarks.from, selectionForMarks.to)
    : new Set<InlineMarkType>();
  const hideBoldItalic = variant === 'title' || variant === 'subtitle';

  const blockClassName = VARIANT_BLOCK_CLASS[variant];
  const resolvedTextareaClassName = textareaClassName ?? blockClassName;
  const resolvedRichClassName = richClassName ?? blockClassName;

  return (
    <div className="rich-text-block-editor">
      {editable && getVisibleEditorModes().length > 0 && (
        <div className="rich-text-block-editor__modes" role="group" aria-label="Режим блока">
          {getModeOrder().map((value) => (
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
            className={['rich-text-block-editor__rich', resolvedRichClassName]
              .filter(Boolean)
              .join(' ')}
            data-block-id={blockId}
            data-testid="rich-text-block-editor-rich"
            data-placeholder={placeholder}
            contentEditable={editable}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            onFocus={onFocus}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />

          {richToolbar && (
            <div
              ref={toolbarRef}
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
                    aria-label="Подтвердить"
                  >
                    <CheckIcon {...TOOLBAR_ICON_PROPS} />
                  </button>
                </div>
              ) : (
                <>
                  {!hideBoldItalic && (
                    <>
                      <button
                        type="button"
                        className="rich-text-block-editor__toolbar-btn"
                        aria-pressed={activeMarks.has('bold')}
                        onMouseDown={keepSelection}
                        onClick={() => applyMark('bold')}
                        title="Жирный"
                        aria-label="Жирный"
                      >
                        <BoldIcon {...TOOLBAR_ICON_PROPS} />
                      </button>
                      <button
                        type="button"
                        className="rich-text-block-editor__toolbar-btn"
                        aria-pressed={activeMarks.has('italic')}
                        onMouseDown={keepSelection}
                        onClick={() => applyMark('italic')}
                        title="Курсив"
                        aria-label="Курсив"
                      >
                        <ItalicIcon {...TOOLBAR_ICON_PROPS} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('underline')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('underline')}
                    title="Подчёркнутый"
                    aria-label="Подчёркнутый"
                  >
                    <UnderlineIcon {...TOOLBAR_ICON_PROPS} />
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('strike')}
                    onMouseDown={keepSelection}
                    onClick={() => applyMark('strike')}
                    title="Зачёркнутый"
                    aria-label="Зачёркнутый"
                  >
                    <StrikethroughIcon {...TOOLBAR_ICON_PROPS} />
                  </button>
                  <button
                    type="button"
                    className="rich-text-block-editor__toolbar-btn"
                    aria-pressed={activeMarks.has('link')}
                    onMouseDown={keepSelection}
                    onClick={handleLinkButton}
                    title="Ссылка"
                    aria-label="Ссылка"
                  >
                    <LinkIcon {...TOOLBAR_ICON_PROPS} />
                  </button>
                  {onBlockFormat && (
                    <>
                      <span
                        className="rich-text-block-editor__toolbar-divider"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className="rich-text-block-editor__toolbar-btn rich-text-block-editor__toolbar-btn--block rich-text-block-editor__toolbar-btn--heading-large"
                        aria-pressed={variant === 'title'}
                        onMouseDown={keepSelection}
                        onClick={() => handleBlockFormat('heading-large')}
                        title="Большой заголовок"
                        aria-label="Большой заголовок"
                      >
                        <span
                          className="rich-text-block-editor__toolbar-heading"
                          aria-hidden="true"
                        >
                          H
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rich-text-block-editor__toolbar-btn rich-text-block-editor__toolbar-btn--block rich-text-block-editor__toolbar-btn--heading-small"
                        aria-pressed={variant === 'subtitle'}
                        onMouseDown={keepSelection}
                        onClick={() => handleBlockFormat('heading-small')}
                        title="Малый заголовок"
                        aria-label="Малый заголовок"
                      >
                        <span
                          className="rich-text-block-editor__toolbar-heading"
                          aria-hidden="true"
                        >
                          H
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rich-text-block-editor__toolbar-btn rich-text-block-editor__toolbar-btn--block"
                        aria-pressed={variant === 'quote'}
                        onMouseDown={keepSelection}
                        onClick={() => handleBlockFormat('quote')}
                        title="Цитата"
                        aria-label="Цитата"
                      >
                        <TextQuoteIcon {...TOOLBAR_ICON_PROPS} />
                      </button>
                    </>
                  )}
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
          {renderRichText(content) ?? (
            <span className="rich-text-block-editor__preview-empty">{placeholder}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={(node) => {
            textareaInternalRef.current = node;
            assignRef(textareaRef, node);
          }}
          className={['rich-text-block-editor__textarea', resolvedTextareaClassName]
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

function resolveDeleteRange(
  root: HTMLElement,
  event: InputEvent,
  model: RichText,
  inputType: string
): SelectionOffsets | null {
  const selection = getSelectionOffsets(root);
  const length = richTextToPlainText(model).length;

  const targetRanges = typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : [];
  if (targetRanges.length > 0) {
    const range = targetRanges[0];
    const a = pointToOffset(root, range.startContainer, range.startOffset);
    const b = pointToOffset(root, range.endContainer, range.endOffset);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    if (from !== to) {
      return { from, to };
    }
  }

  if (!selection) return null;
  if (selection.from !== selection.to) return selection;

  if (inputType === 'deleteContentForward') {
    if (selection.from >= length) return null;
    return { from: selection.from, to: Math.min(selection.from + 1, length) };
  }

  if (selection.from === 0) return { from: 0, to: 0 };
  return { from: selection.from - 1, to: selection.from };
}
