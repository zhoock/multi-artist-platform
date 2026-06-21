import { useEffect, useState } from 'react';
import {
  ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS,
  consumeArchiveArtistRemovedToast,
} from '@shared/lib/archiveArtistRemovedToast';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="archive-artist-removed-toast__icon-svg"
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

type ArchiveArtistRemovedToastProps = {
  triggerKey: unknown;
};

export function ArchiveArtistRemovedToast({ triggerKey }: ArchiveArtistRemovedToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumeArchiveArtistRemovedToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(
      () => setMessage(null),
      ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS
    );
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="archive-artist-removed-toast"
      role="status"
      aria-live="polite"
      style={
        {
          '--archive-artist-removed-toast-duration': `${ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="archive-artist-removed-toast__icon">
        <SuccessIcon />
      </div>
      <div className="archive-artist-removed-toast__body">
        <p className="archive-artist-removed-toast__title">{message}</p>
      </div>
      <div className="archive-artist-removed-toast__progress" aria-hidden="true" />
    </div>
  );
}
