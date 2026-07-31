import { describe, test, expect, afterEach } from '@jest/globals';
import { render } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';

import { MinimalLayout } from '../MinimalLayout';
import { isServiceScreenBodyClassActive } from '../serviceScreenBodyClass';

/** Mirrors App.tsx Layout body-class effect for service/minimal routes. */
function AppLayoutShell({
  isPaymentRoute,
  shouldHideChrome,
  isMinimalLayoutRoute,
  children,
}: {
  isPaymentRoute: boolean;
  shouldHideChrome: boolean;
  isMinimalLayoutRoute: boolean;
  children: ReactNode;
}) {
  const isServiceScreenRoute = isServiceScreenBodyClassActive({
    isPaymentRoute,
    shouldHideChrome,
    isMinimalLayoutRoute,
  });

  useLayoutEffect(() => {
    if (isServiceScreenRoute) {
      document.body.classList.add('page--service-screen');
    } else {
      document.body.classList.remove('page--service-screen');
    }
    return () => {
      document.body.classList.remove('page--service-screen');
    };
  }, [isServiceScreenRoute]);

  return children;
}

describe('service screen body class integration', () => {
  afterEach(() => {
    document.body.classList.remove('page--service-screen');
  });

  test('applies page--service-screen for minimal layout routes', () => {
    render(
      <AppLayoutShell isPaymentRoute={false} shouldHideChrome={false} isMinimalLayoutRoute={true}>
        <MinimalLayout>
          <div>Email verified</div>
        </MinimalLayout>
      </AppLayoutShell>
    );

    expect(document.body.classList.contains('page--service-screen')).toBe(true);
  });

  test('removes page--service-screen when navigating to a standard route', () => {
    const { rerender } = render(
      <AppLayoutShell isPaymentRoute={false} shouldHideChrome={false} isMinimalLayoutRoute={true}>
        <MinimalLayout>
          <div>Email verified</div>
        </MinimalLayout>
      </AppLayoutShell>
    );

    expect(document.body.classList.contains('page--service-screen')).toBe(true);

    rerender(
      <AppLayoutShell isPaymentRoute={false} shouldHideChrome={false} isMinimalLayoutRoute={false}>
        <main>
          <div>Albums</div>
        </main>
      </AppLayoutShell>
    );

    expect(document.body.classList.contains('page--service-screen')).toBe(false);
  });

  test('applies page--service-screen for 404 routes', () => {
    render(
      <AppLayoutShell isPaymentRoute={false} shouldHideChrome={true} isMinimalLayoutRoute={false}>
        <main>
          <div>404</div>
        </main>
      </AppLayoutShell>
    );

    expect(document.body.classList.contains('page--service-screen')).toBe(true);
  });
});
