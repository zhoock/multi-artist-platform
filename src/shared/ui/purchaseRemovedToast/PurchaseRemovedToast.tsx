import { useEffect, useState } from 'react';
import {
  PURCHASE_REMOVED_TOAST_DURATION_MS,
  consumePurchaseRemovedToast,
} from '@shared/lib/purchaseRemovedToast';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="purchase-removed-toast__icon-svg"
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

type PurchaseRemovedToastProps = {
  triggerKey: unknown;
};

export function PurchaseRemovedToast({ triggerKey }: PurchaseRemovedToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumePurchaseRemovedToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(null), PURCHASE_REMOVED_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="purchase-removed-toast"
      role="status"
      aria-live="polite"
      style={
        {
          '--purchase-removed-toast-duration': `${PURCHASE_REMOVED_TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="purchase-removed-toast__icon">
        <SuccessIcon />
      </div>
      <div className="purchase-removed-toast__body">
        <p className="purchase-removed-toast__title">{message}</p>
      </div>
      <div className="purchase-removed-toast__progress" aria-hidden="true" />
    </div>
  );
}
