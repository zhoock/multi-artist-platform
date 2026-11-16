import { useCallback, useId, useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import { ArrowUp as SendIcon, X as DismissIcon } from 'lucide-react';
import { MAX_ALBUM_COMMENT_CHARS, isSubmittableCommentBody } from '../lib/commentBody';
import { ALBUM_COMMENTS_MOBILE_MQ } from '../lib/albumCommentsViewport';
import { AlbumCommentAvatar } from './AlbumCommentAvatar';

export type AlbumCommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder: string;
  avatarPath?: string | null;
  imageUrl?: string | null;
  displayName: string;
  compact?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Secondary header shown above the field in reply mode. */
  replyBannerLabel?: string;
  onDismissReply?: () => void;
  /** When changed, focuses textarea and places caret at end (after @mention). */
  focusRequestKey?: string | null;
};

function syncComposerTextareaHeight(textarea: HTMLTextAreaElement) {
  const maxBlockSize = parseFloat(getComputedStyle(textarea).maxBlockSize);
  const maxHeight = Number.isFinite(maxBlockSize) ? maxBlockSize : textarea.scrollHeight;

  textarea.style.height = 'auto';
  const scrollHeight = textarea.scrollHeight;
  const nextHeight = Math.min(scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = scrollHeight > maxHeight + 1 ? 'auto' : 'hidden';
}

export function AlbumCommentComposer({
  value,
  onChange,
  onSubmit,
  onFocus,
  disabled = false,
  sending = false,
  placeholder,
  avatarPath,
  imageUrl,
  displayName,
  compact = false,
  onCancel,
  cancelLabel,
  replyBannerLabel,
  onDismissReply,
  focusRequestKey,
}: AlbumCommentComposerProps) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = isSubmittableCommentBody(value) && !disabled && !sending;
  const showSendButton = value.length > 0;

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) syncComposerTextareaHeight(textarea);
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useLayoutEffect(() => {
    if (!focusRequestKey) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [focusRequestKey]);

  return (
    <div
      className={clsx('album-comments__composer', compact && 'album-comments__composer--compact')}
    >
      <AlbumCommentAvatar
        avatarPath={avatarPath}
        imageUrl={imageUrl}
        displayName={displayName}
        size={compact ? 'sm' : 'md'}
      />
      <div className="album-comments__composer-field">
        {replyBannerLabel && onDismissReply ? (
          <div className="album-comments__composer-reply-banner">
            <span className="album-comments__composer-reply-banner-label">{replyBannerLabel}</span>
            <button
              type="button"
              className="album-comments__composer-reply-dismiss"
              aria-label={cancelLabel ?? replyBannerLabel}
              onClick={onDismissReply}
            >
              <DismissIcon size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
        <div className="album-comments__composer-input-wrap">
          <textarea
            id={textareaId}
            ref={textareaRef}
            className={clsx(
              'album-comments__composer-input',
              showSendButton && 'album-comments__composer-input--with-send'
            )}
            rows={1}
            value={value}
            placeholder={placeholder}
            maxLength={MAX_ALBUM_COMMENT_CHARS}
            disabled={disabled || sending}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => {
              onFocus?.();
              if (
                typeof window !== 'undefined' &&
                window.matchMedia(ALBUM_COMMENTS_MOBILE_MQ).matches
              ) {
                window.setTimeout(() => {
                  event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }, 300);
              }
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSubmit) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          {showSendButton ? (
            <button
              type="button"
              className="album-comments__composer-send"
              disabled={!canSubmit}
              aria-label={placeholder}
              onClick={onSubmit}
            >
              <SendIcon size={18} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        <div className="album-comments__composer-meta">
          {onCancel && cancelLabel ? (
            <button
              type="button"
              className="album-comments__text-action album-comments__text-action--muted"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          ) : null}
          <span className="album-comments__composer-count" aria-live="polite">
            {value.length} / {MAX_ALBUM_COMMENT_CHARS}
          </span>
        </div>
      </div>
    </div>
  );
}
