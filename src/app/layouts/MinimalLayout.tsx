import { type ReactNode } from 'react';

import { ErrorBoundary } from '@shared/ui/error-boundary';

type MinimalLayoutProps = {
  children: ReactNode;
};

/** Standalone service pages — no global header, footer, hero, or player. */
export function MinimalLayout({ children }: MinimalLayoutProps) {
  return (
    <ErrorBoundary>
      <main>{children}</main>
    </ErrorBoundary>
  );
}
