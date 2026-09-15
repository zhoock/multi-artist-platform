import { createPortal } from 'react-dom';

import { DashboardSpinner } from '@shared/ui/dashboard';

import './InitialAppLoader.scss';

/**
 * Fullscreen branded loader for the first app bootstrap:
 * RouterProvider `fallbackElement` (root loader) and the Home lazy chunk.
 * Portaled to `document.body` so `#root` grid / player / header cannot shift it.
 */
export function InitialAppLoader() {
  const overlay = (
    <div className="initial-app-loader" role="status" aria-live="polite" aria-busy="true">
      <DashboardSpinner />
    </div>
  );

  if (typeof document === 'undefined') {
    return overlay;
  }

  return createPortal(overlay, document.body);
}

/** In-flow spinner for subsequent lazy routes — not a viewport overlay. */
export function PageRouteLoader() {
  return (
    <div className="page-route-loader" role="status" aria-live="polite" aria-busy="true">
      <DashboardSpinner />
    </div>
  );
}
