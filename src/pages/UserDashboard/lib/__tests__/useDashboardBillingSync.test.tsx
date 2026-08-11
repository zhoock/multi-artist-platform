/** @jest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { PremiumSubscriptionProvider, usePremiumSubscription } from '@features/premiumSubscription';
import { RENEWAL_BILLING_REFRESH_INTERVAL_MS } from '@shared/lib/subscription/useRenewalBillingRefresh';

import { DashboardBillingSync } from '../../components/DashboardBillingSync';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
}));

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  removeArtistFromArchiveApi: jest.fn(),
  activateArchiveArtistsApi: jest.fn(),
  ArchiveApiError: class ArchiveApiError extends Error {},
}));

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: jest.fn(),
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

jest.mock('@shared/lib/subscription/useSubscriptionRebindPayment', () => ({
  useSubscriptionRebindPayment: () => ({
    startRebind: jest.fn(),
  }),
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => true,
}));

const NEXT_CHARGE_AT = '2026-08-07T12:05:00.000Z';
const EXPIRES_AT = '2026-09-03T00:00:00.000Z';

function archivePayload(billingOverrides: Record<string, unknown> = {}) {
  return {
    isPremium: true,
    slotsUsed: 2,
    slotsLimit: 10,
    inactiveCount: 0,
    artists: [],
    billing: {
      ...EMPTY_BILLING_SNAPSHOT,
      hasPremiumAccess: true,
      status: 'active',
      plan: 'supporter',
      autoRenewEnabled: true,
      nextChargeAt: NEXT_CHARGE_AT,
      expiresAt: EXPIRES_AT,
      slotsLimit: 10,
      ...billingOverrides,
    },
  };
}

function CollectionBillingProbe() {
  const premium = usePremiumSubscription();
  const slotsLimit = premium.billing.slotsLimit ?? premium.slotsLimit;
  const slotsRemaining = Math.max(0, slotsLimit - premium.slotsUsed);

  return (
    <div
      data-testid="collection-billing-probe"
      data-has-premium={String(premium.billing.hasPremiumAccess)}
      data-slots-limit={String(slotsLimit)}
      data-slots-remaining={String(slotsRemaining)}
      data-status={premium.billing.status ?? ''}
    />
  );
}

type DashboardTab = 'collection' | 'subscription';

function DashboardShell({ tab }: { tab: DashboardTab }) {
  return (
    <PremiumSubscriptionProvider>
      <DashboardBillingSync />
      {tab === 'collection' ? (
        <CollectionBillingProbe />
      ) : (
        <div data-testid="subscription-tab-stub" />
      )}
    </PremiumSubscriptionProvider>
  );
}

function readProbe() {
  const probe = document.querySelector('[data-testid="collection-billing-probe"]');
  if (!probe) {
    throw new Error('Collection billing probe not mounted');
  }
  return {
    hasPremium: probe.getAttribute('data-has-premium'),
    slotsLimit: probe.getAttribute('data-slots-limit'),
    slotsRemaining: probe.getAttribute('data-slots-remaining'),
    status: probe.getAttribute('data-status'),
  };
}

describe('useDashboardBillingSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    getMyArchiveMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps renewal polling on collection tab and updates billing snapshot', async () => {
    getMyArchiveMock
      .mockResolvedValueOnce(
        archivePayload({
          hasPremiumAccess: false,
          status: 'past_due',
          slotsLimit: 3,
        })
      )
      .mockResolvedValue(
        archivePayload({
          hasPremiumAccess: true,
          status: 'active',
          slotsLimit: 10,
        })
      );

    render(<DashboardShell tab="collection" />);

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(readProbe().hasPremium).toBe('false');
      expect(readProbe().slotsLimit).toBe('3');
      expect(readProbe().status).toBe('past_due');
    });

    const callsBeforePoll = getMyArchiveMock.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    await waitFor(() => {
      expect(getMyArchiveMock.mock.calls.length).toBeGreaterThan(callsBeforePoll);
    });

    await waitFor(() => {
      const probe = readProbe();
      expect(probe.hasPremium).toBe('true');
      expect(probe.slotsLimit).toBe('10');
      expect(probe.slotsRemaining).toBe('8');
      expect(probe.status).toBe('active');
    });
  });

  test('switching collection and subscription tabs does not start a second renewal polling loop', async () => {
    getMyArchiveMock.mockResolvedValue(archivePayload());

    const { rerender } = render(<DashboardShell tab="collection" />);

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    await waitFor(() => {
      expect(getMyArchiveMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const callsAfterFirstPoll = getMyArchiveMock.mock.calls.length;

    rerender(<DashboardShell tab="subscription" />);
    rerender(<DashboardShell tab="collection" />);

    await act(async () => {
      jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => {
      const pollCalls = getMyArchiveMock.mock.calls.length - callsAfterFirstPoll;
      expect(pollCalls).toBe(1);
    });
  });
});
