import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import {
  ARTICLE_EDITOR_TOAST_DURATION_MS,
  ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS,
  consumeArticleEditorToast,
  type ArticleEditorToastPayload,
} from '@shared/lib/articleEditorToast';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="article-editor-toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 10.5L8.5 14L15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="article-editor-toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type ArticleEditorToastProps = {
  /** Re-run sessionStorage consume when this value changes. */
  triggerKey?: unknown;
  /** Direct payload while a nested dialog (article editor) is open. */
  payload?: ArticleEditorToastPayload | null;
  onDismiss?: () => void;
};

export function ArticleEditorToast({ triggerKey, payload, onDismiss }: ArticleEditorToastProps) {
  const { lang } = useLang();
  const navigate = useNavigate();
  const [queuedPayload, setQueuedPayload] = useState<ArticleEditorToastPayload | null>(null);
  const activePayload = payload ?? queuedPayload;

  useEffect(() => {
    if (payload != null) return;
    const nextPayload = consumeArticleEditorToast();
    if (nextPayload) {
      setQueuedPayload(nextPayload);
    }
  }, [triggerKey, payload]);

  useEffect(() => {
    if (payload != null) {
      setQueuedPayload(null);
    }
  }, [payload]);

  useEffect(() => {
    if (!activePayload) return undefined;

    const duration =
      activePayload.kind === 'published'
        ? ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS
        : ARTICLE_EDITOR_TOAST_DURATION_MS;
    const timer = window.setTimeout(() => {
      setQueuedPayload(null);
      onDismiss?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [activePayload, onDismiss]);

  if (!activePayload) return null;

  const en = lang !== 'ru';
  const duration =
    activePayload.kind === 'published'
      ? ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS
      : ARTICLE_EDITOR_TOAST_DURATION_MS;

  let title = '';
  let actionLabel: string | null = null;
  let actionHref: string | null = null;

  switch (activePayload.kind) {
    case 'draft-saved':
      title = en ? 'Draft saved' : 'Черновик сохранён';
      break;
    case 'published':
      title = en ? 'Article published' : 'Статья опубликована';
      actionLabel = en ? 'Open article' : 'Открыть статью';
      actionHref = activePayload.articleHref;
      break;
    case 'error':
      title = activePayload.message;
      break;
    default:
      break;
  }

  const dismiss = () => {
    setQueuedPayload(null);
    onDismiss?.();
  };

  const handleOpenArticle = () => {
    if (!actionHref) return;
    dismiss();
    navigate(actionHref);
  };

  return (
    <div className="article-editor-toast-layer" aria-live="polite">
      <div
        className={`article-editor-toast${activePayload.kind === 'error' ? ' article-editor-toast--error' : ''}`}
        role="status"
        style={
          {
            '--article-editor-toast-duration': `${duration}ms`,
          } as React.CSSProperties
        }
      >
        <div className="article-editor-toast__icon">
          {activePayload.kind === 'error' ? <ErrorIcon /> : <SuccessIcon />}
        </div>
        <div className="article-editor-toast__body">
          <p className="article-editor-toast__title">{title}</p>
          {actionLabel && actionHref ? (
            <button
              type="button"
              className="article-editor-toast__action"
              onClick={handleOpenArticle}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        <div className="article-editor-toast__progress" aria-hidden="true" />
      </div>
    </div>
  );
}
