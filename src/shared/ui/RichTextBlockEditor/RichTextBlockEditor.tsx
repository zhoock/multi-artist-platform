import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type Ref,
} from 'react';

import type { RichText } from '@shared/lib/richText';
import { renderRichText } from '@shared/lib/richText';
import { useLocalMarkdownBuffer } from '@shared/lib/richText/useLocalMarkdownBuffer';

import './RichTextBlockEditor.style.scss';

export type RichTextBlockEditorProps = {
  content: RichText;
  onChange: (content: RichText) => void;
  editable?: boolean;
  previewMode?: boolean;
  onPreviewModeChange?: (previewMode: boolean) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  textareaClassName?: string;
  blockId?: string;
  placeholder?: string;
  rows?: number;
  onFocus?: () => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaChange?: (markdown: string, event: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref && typeof ref === 'object') {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

export function RichTextBlockEditor({
  content,
  onChange,
  editable = true,
  previewMode,
  onPreviewModeChange,
  textareaRef,
  textareaClassName,
  blockId,
  placeholder,
  rows = 1,
  onFocus,
  onBlur,
  onKeyDown,
  onPaste,
  onTextareaChange,
}: RichTextBlockEditorProps) {
  const [internalPreviewMode, setInternalPreviewMode] = useState(false);
  const isPreviewControlled = previewMode !== undefined;
  const isPreview = isPreviewControlled ? previewMode : internalPreviewMode;
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(
    null
  ) as MutableRefObject<HTMLTextAreaElement | null>;
  const { localMarkdown, handleChange: handleMarkdownChange } = useLocalMarkdownBuffer(
    content,
    onChange
  );

  const setPreviewMode = (next: boolean) => {
    if (!isPreviewControlled) {
      setInternalPreviewMode(next);
    }
    onPreviewModeChange?.(next);
  };

  useEffect(() => {
    if (isPreview) return;
    const textarea = localTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [localMarkdown, isPreview]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleMarkdownChange(event.target.value);
    onTextareaChange?.(event.target.value, event);
  };

  const previewContent = renderRichText(content);

  return (
    <div className="rich-text-block-editor">
      {editable && (
        <button
          type="button"
          className="rich-text-block-editor__mode-toggle"
          aria-pressed={isPreview}
          onClick={() => setPreviewMode(!isPreview)}
        >
          {isPreview ? 'Edit' : 'Preview'}
        </button>
      )}

      {isPreview ? (
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
            localTextareaRef.current = node;
            assignRef(textareaRef, node);
          }}
          className={['rich-text-block-editor__textarea', textareaClassName]
            .filter(Boolean)
            .join(' ')}
          data-block-id={blockId}
          value={localMarkdown}
          onChange={handleChange}
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
