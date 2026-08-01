import { type CSSProperties } from 'react';
import { X as XIcon } from 'lucide-react';

import { ToastTopLayer } from '@shared/ui/toastTopLayer';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import { dismissToast } from './toastStore';
import type { ToastItem, ToastPlacement, ToastVariant } from './types';
import './style.scss';

type ToastStackProps = {
  placement: ToastPlacement;
  toasts: readonly ToastItem[];
};

function SuccessIcon() {
  return (
    <svg
      className="toast__icon-svg"
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
      className="toast__icon-svg"
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

function WarningIcon() {
  return (
    <svg
      className="toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10 3.5 16.5 16.5H3.5L10 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9v5M10 6h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ToastVariantIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'error':
      return <ErrorIcon />;
    case 'warning':
      return <WarningIcon />;
    case 'info':
      return <InfoIcon />;
    case 'success':
    default:
      return <SuccessIcon />;
  }
}

function ToastCard({ item }: { item: ToastItem }) {
  const isError = item.variant === 'error';
  const showProgress = item.duration != null && item.duration > 0;
  const showDismiss = item.dismissible || item.duration == null;

  const handleDismiss = () => {
    dismissToast(item.id);
  };

  const handleUndo = () => {
    item.undo?.onUndo();
    dismissToast(item.id);
  };

  return (
    <div
      className={`toast toast--${item.variant}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      style={
        showProgress ? ({ '--toast-duration': `${item.duration}ms` } as CSSProperties) : undefined
      }
    >
      <div className="toast__icon">
        <ToastVariantIcon variant={item.variant} />
      </div>
      <div className="toast__body">
        <p className="toast__title">{item.title}</p>
        {item.description ? <p className="toast__description">{item.description}</p> : null}
        {item.action ? (
          <button type="button" className="toast__action" onClick={item.action.onClick}>
            {item.action.label}
          </button>
        ) : null}
        {item.undo ? (
          <button type="button" className="toast__action" onClick={handleUndo}>
            {item.undo.label}
          </button>
        ) : null}
      </div>
      {showDismiss ? (
        <button type="button" className="toast__close" onClick={handleDismiss} aria-label="Close">
          <XIcon {...dashboardActionIconProps({ size: 18 })} />
        </button>
      ) : null}
      {showProgress ? <div className="toast__progress" aria-hidden="true" /> : null}
    </div>
  );
}

function ToastStack({ placement, toasts }: ToastStackProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={`toast-viewport toast-viewport--${placement}`} data-placement={placement}>
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

type ToastViewportProps = {
  toasts: readonly ToastItem[];
};

export function ToastViewport({ toasts }: ToastViewportProps) {
  const defaultToasts = toasts.filter((item) => item.layer === 'default');
  const topLayerToasts = toasts.filter((item) => item.layer === 'top');

  const placements: ToastPlacement[] = ['top-right', 'top-right-offset', 'bottom-center'];

  return (
    <>
      {placements.map((placement) => (
        <ToastStack
          key={placement}
          placement={placement}
          toasts={defaultToasts.filter((item) => item.placement === placement)}
        />
      ))}

      {topLayerToasts.length > 0 ? (
        <ToastTopLayer open>
          <div className="toast-viewport toast-viewport--top-layer">
            {topLayerToasts.map((item) => (
              <ToastCard key={item.id} item={item} />
            ))}
          </div>
        </ToastTopLayer>
      ) : null}
    </>
  );
}
