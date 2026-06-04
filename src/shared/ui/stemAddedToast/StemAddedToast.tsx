import { useEffect, useState } from 'react';
import { STEM_ADDED_TOAST_DURATION_MS, consumeStemAddedToast } from '@shared/lib/stemAddedToast';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="stem-added-toast__icon-svg"
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

type StemAddedToastProps = {
  triggerKey: unknown;
};

export function StemAddedToast({ triggerKey }: StemAddedToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumeStemAddedToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(null), STEM_ADDED_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="stem-added-toast"
      role="status"
      aria-live="polite"
      style={
        {
          '--stem-added-toast-duration': `${STEM_ADDED_TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="stem-added-toast__icon">
        <SuccessIcon />
      </div>
      <div className="stem-added-toast__body">
        <p className="stem-added-toast__title">{message}</p>
      </div>
      <div className="stem-added-toast__progress" aria-hidden="true" />
    </div>
  );
}
