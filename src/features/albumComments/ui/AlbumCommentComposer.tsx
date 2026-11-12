import { useId, useRef } from 'react';
import clsx from 'clsx';
import { SendHorizonal as SendIcon } from 'lucide-react';
import { MAX_ALBUM_COMMENT_CHARS, isSubmittableCommentBody } from '../lib/commentBody';
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
};

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
}: AlbumCommentComposerProps) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = isSubmittableCommentBody(value) && !disabled && !sending;

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
        <textarea
          id={textareaId}
          ref={textareaRef}
          className="album-comments__composer-input"
          rows={compact ? 2 : 3}
          value={value}
          placeholder={placeholder}
          maxLength={MAX_ALBUM_COMMENT_CHARS}
          disabled={disabled || sending}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
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
          <div className="album-comments__composer-meta-trailing">
            <span className="album-comments__composer-count" aria-live="polite">
              {value.length} / {MAX_ALBUM_COMMENT_CHARS}
            </span>
            <button
              type="button"
              className="album-comments__composer-send"
              disabled={!canSubmit}
              aria-label={placeholder}
              onClick={onSubmit}
            >
              <SendIcon size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
