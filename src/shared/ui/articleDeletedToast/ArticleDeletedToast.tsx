import { useEffect, useState } from 'react';
import {
  ARTICLE_DELETED_TOAST_DURATION_MS,
  consumeArticleDeletedToast,
} from '@shared/lib/articleDeletedToast';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="article-deleted-toast__icon-svg"
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

type ArticleDeletedToastProps = {
  triggerKey: unknown;
};

export function ArticleDeletedToast({ triggerKey }: ArticleDeletedToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumeArticleDeletedToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(null), ARTICLE_DELETED_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="article-deleted-toast"
      role="status"
      aria-live="polite"
      style={
        {
          '--article-deleted-toast-duration': `${ARTICLE_DELETED_TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="article-deleted-toast__icon">
        <SuccessIcon />
      </div>
      <div className="article-deleted-toast__body">
        <p className="article-deleted-toast__title">{message}</p>
      </div>
      <div className="article-deleted-toast__progress" aria-hidden="true" />
    </div>
  );
}
