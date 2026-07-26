import { useEffect, useState } from 'react';
import { MIX_TOAST_DURATION_MS, consumeMixToast } from '@shared/lib/mixToast';
import { ToastTopLayer } from '@shared/ui/toastTopLayer';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="mix-toast__icon-svg"
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

type MixToastProps = {
  triggerKey: unknown;
};

export function MixToast({ triggerKey }: MixToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumeMixToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(null), MIX_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <ToastTopLayer open>
      <div
        className="mix-toast"
        role="status"
        aria-live="polite"
        style={
          {
            '--mix-toast-duration': `${MIX_TOAST_DURATION_MS}ms`,
          } as React.CSSProperties
        }
      >
        <div className="mix-toast__icon">
          <SuccessIcon />
        </div>
        <div className="mix-toast__body">
          <p className="mix-toast__title">{message}</p>
        </div>
        <div className="mix-toast__progress" aria-hidden="true" />
      </div>
    </ToastTopLayer>
  );
}
