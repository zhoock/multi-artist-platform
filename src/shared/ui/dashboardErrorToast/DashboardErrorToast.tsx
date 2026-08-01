import { useEffect, useState } from 'react';
import {
  DASHBOARD_ERROR_TOAST_DURATION_MS,
  consumeDashboardErrorToast,
} from '@shared/lib/dashboardErrorToast';
import './style.scss';

function ErrorIcon() {
  return (
    <svg
      className="dashboard-error-toast__icon-svg"
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

type DashboardErrorToastProps = {
  triggerKey: unknown;
};

export function DashboardErrorToast({ triggerKey }: DashboardErrorToastProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = consumeDashboardErrorToast();
    if (nextMessage) {
      setMessage(nextMessage);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(null), DASHBOARD_ERROR_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="dashboard-error-toast"
      role="alert"
      aria-live="assertive"
      style={
        {
          '--dashboard-error-toast-duration': `${DASHBOARD_ERROR_TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="dashboard-error-toast__icon">
        <ErrorIcon />
      </div>
      <div className="dashboard-error-toast__body">
        <p className="dashboard-error-toast__title">{message}</p>
      </div>
      <div className="dashboard-error-toast__progress" aria-hidden="true" />
    </div>
  );
}
