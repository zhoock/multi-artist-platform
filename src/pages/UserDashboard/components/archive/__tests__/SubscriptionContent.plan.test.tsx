/**
 * UI tests for plan display and billing actions in SubscriptionContent.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import type { SubscriptionCheckoutResult } from '@shared/lib/archiveAccessModal/useSubscriptionCheckout';
import { buildSubscriptionPaymentStatusReturnUrl } from '@shared/lib/internalAppUrls';

import { SubscriptionContent } from '../SubscriptionContent';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const openSupportModalMock = jest.fn();
const startCheckoutMock = jest.fn<(planSlug: string) => Promise<SubscriptionCheckoutResult>>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
}));

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
}));

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: openSupportModalMock,
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: (planSlug: string) => startCheckoutMock(planSlug),
  }),
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => true,
}));

jest.mock('@shared/lib/subscription/useSubscriptionRebindPayment', () => ({
  useSubscriptionRebindPayment: () => ({
    startRebind: jest.fn(),
  }),
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => null,
}));

jest.mock('@shared/api/subscription', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  deleteSubscriptionPaymentMethod: jest.fn(),
  scheduleSubscriptionDowngrade: jest.fn(),
  cancelScheduledSubscriptionDowngrade: jest.fn(),
}));

function billingActive(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'active',
    plan: 'explorer',
    slotsLimit: 1,
    expiresAt: '2026-09-03T12:00:00.000Z',
    nextChargeAt: '2026-09-03T12:00:00.000Z',
    autoRenewEnabled: true,
    hasPremiumAccess: true,
    hasSavedPaymentMethod: true,
    paymentMethodTitle: 'Visa •••• 4242',
    ...overrides,
  };
}

function billingNone(): BillingSnapshot {
  return { ...EMPTY_BILLING_SNAPSHOT };
}

function billingExpired(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'expired',
    plan: 'explorer',
    slotsLimit: 1,
    expiresAt: '2026-06-01T12:00:00.000Z',
    hasPremiumAccess: false,
    ...overrides,
  };
}

function archivePayload(overrides: Record<string, unknown> = {}) {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 1,
    inactiveCount: 0,
    subscriptionExpiresAt: '2026-09-03T12:00:00.000Z',
    billing: billingActive(),
    artists: [],
    ...overrides,
  };
}

function renderSubscription(
  ui: React.ReactElement,
  initialEntries: string[] = ['/dashboard/subscription']
) {
  return renderWithProviders(
    <PremiumSubscriptionProvider>
      <ToastProvider>{ui}</ToastProvider>
    </PremiumSubscriptionProvider>,
    { initialEntries }
  );
}

describe('SubscriptionContent plan display', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    openSupportModalMock.mockReset();
    startCheckoutMock.mockReset();
    startCheckoutMock.mockResolvedValue({ ok: true, redirected: 'payment' });
  });

  test('shows billing summary with plan and support status when active', async () => {
    getMyArchiveMock.mockResolvedValue(archivePayload());

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByText('Explorer')).toBeTruthy();
    });

    expect(screen.getByText(/Next charge —|Следующее списание —/i)).toBeTruthy();
    expect(document.querySelector('.collection-billing')).toBeTruthy();
    expect(screen.getByText(/Change$|Сменить$/)).toBeTruthy();
    expect(document.querySelector('.collection-billing__usage-card')).toBeNull();
  });

  test('shows empty state when user has no subscription history', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      billing: billingNone(),
      artists: [],
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByText(/No active subscription|Нет активной подписки/i)).toBeTruthy();
    });

    expect(screen.queryByText('Explorer')).toBeNull();
    expect(document.querySelector('.collection-billing__plan-card')).toBeNull();
  });

  test('shows expired banner with choose plan action when support is inactive', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 1,
      billing: billingExpired(),
      artists: [],
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Choose a plan|Выбрать тариф/i })).toBeTruthy();
    });

    expect(screen.getByText(/Support ended|Поддержка завершена/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Choose a plan|Выбрать тариф/i }));
    expect(openSupportModalMock).toHaveBeenCalled();
  });

  test('renew current plan button starts checkout for expired support', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 20,
      billing: billingExpired({ plan: 'explorer', slotsLimit: 20 }),
      artists: [],
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Renew Explorer|Возобновить Explorer/i })
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Renew Explorer|Возобновить Explorer/i }));

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith('explorer');
    });
  });

  test('opens plan modal when change plan button is clicked', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
      })
    );

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Change$|Сменить$/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Change$|Сменить$/ }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows cancelled banner when auto-renew is off', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        billing: billingActive({
          status: 'cancel_at_period_end',
          autoRenewEnabled: false,
          hasPremiumAccess: true,
        }),
      })
    );

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Support cancelled|Поддержка отменена/i)).toBeTruthy();
    });

    expect(
      screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i })
    ).toBeTruthy();
  });

  test('checkout return URL preserves subscription dashboard path', () => {
    const returnUrl = buildSubscriptionPaymentStatusReturnUrl('/dashboard/subscription');
    const parsed = new URL(returnUrl);
    expect(parsed.searchParams.get('returnTo')).toBe('/dashboard/subscription');
  });
});

describe('dashboard subscription tab', () => {
  test('subscription slug is allowed for listener accounts', async () => {
    const { getVisibleDashboardTabs, isDashboardTabAllowed } = await import(
      '@shared/lib/accountType'
    );
    const user = {
      id: 'u1',
      email: 'l@test.com',
      name: null,
      accountType: 'listener' as const,
    };

    expect(getVisibleDashboardTabs(user)).toContain('subscription');
    expect(isDashboardTabAllowed('subscription', user)).toBe(true);
  });
});
