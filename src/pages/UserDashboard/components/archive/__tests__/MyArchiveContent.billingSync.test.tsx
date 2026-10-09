/**
 * Renewal / period-end sync must not flash the dashboard loading shell or reload the document.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';
import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import { ARCHIVE_CHANGED_EVENT } from '@features/artistArchive';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { resetMyArchiveFetchGenerationForTests } from '@shared/lib/archive/myArchiveFetchGeneration';

import { DashboardBillingSync } from '../../../components/DashboardBillingSync';
import { MyArchiveContent } from '../MyArchiveContent';
import { RENEWAL_BILLING_REFRESH_INTERVAL_MS } from '@shared/lib/subscription/useRenewalBillingRefresh';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();

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

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => true,
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
}));

const NEXT_CHARGE_AT = '2026-08-07T12:05:00.000Z';
const EXPIRES_AT = '2026-08-07T12:05:00.000Z';

function billing(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'active',
    plan: 'explorer',
    slotsLimit: 3,
    autoRenewEnabled: true,
    nextChargeAt: NEXT_CHARGE_AT,
    expiresAt: EXPIRES_AT,
    hasPremiumAccess: true,
    hasSavedPaymentMethod: true,
    ...overrides,
  };
}

function archivePayload(billingSnapshot: BillingSnapshot) {
  return {
    isPremium: billingSnapshot.hasPremiumAccess,
    slotsUsed: 1,
    slotsLimit: 3,
    inactiveCount: 0,
    artists: [
      {
        id: '1',
        artistUserId: 'a1',
        name: 'Artist',
        slug: 'artist',
        genreCode: 'rock',
        genreLabel: { en: 'Rock', ru: 'Рок' },
        cover: null,
        addedAt: '2026-01-01',
        isActive: true,
        isLocked: true,
        lockedUntil: '2026-08-01T12:00:00.000Z',
      },
    ],
    billing: billingSnapshot,
  };
}

describe('MyArchiveContent billing sync without document reload', () => {
  let onContentBusy: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T12:04:50.000Z'));
    resetMyArchiveFetchGenerationForTests();
    onContentBusy = jest.fn();
    getMyArchiveMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderCollection() {
    return renderWithProviders(
      <PremiumSubscriptionProvider>
        <DashboardBillingSync />
        <ToastProvider>
          <MyArchiveContent active onContentBusy={onContentBusy} />
        </ToastProvider>
      </PremiumSubscriptionProvider>
    );
  }

  test('period end + renewal polling does not repeat onContentBusy (no tab loading shell)', async () => {
    getMyArchiveMock
      .mockResolvedValueOnce(archivePayload(billing({ hasPremiumAccess: true })))
      .mockResolvedValueOnce(
        archivePayload(billing({ hasPremiumAccess: false, status: 'past_due' }))
      )
      .mockResolvedValue(archivePayload(billing({ hasPremiumAccess: true, status: 'active' })));

    renderCollection();

    await waitFor(() => {
      expect(screen.getByText('Artist')).toBeTruthy();
    });

    expect(onContentBusy).toHaveBeenCalledTimes(1);
    const busyCallsAfterInitial = onContentBusy.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => {
      expect(getMyArchiveMock.mock.calls.length).toBeGreaterThan(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => {
      expect(getMyArchiveMock.mock.calls.length).toBeGreaterThan(2);
    });

    expect(onContentBusy.mock.calls.length).toBe(busyCallsAfterInitial);
  });

  test('billing-only archive refresh does not dispatch archive:changed', async () => {
    const archiveChanged = jest.fn();
    window.addEventListener(ARCHIVE_CHANGED_EVENT, archiveChanged);

    getMyArchiveMock
      .mockResolvedValueOnce(archivePayload(billing({ hasPremiumAccess: true })))
      .mockResolvedValue(archivePayload(billing({ hasPremiumAccess: false, status: 'past_due' })));

    renderCollection();

    await waitFor(() => {
      expect(screen.getByText('Artist')).toBeTruthy();
    });

    archiveChanged.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => {
      expect(getMyArchiveMock.mock.calls.length).toBeGreaterThan(1);
    });

    expect(archiveChanged).not.toHaveBeenCalled();

    window.removeEventListener(ARCHIVE_CHANGED_EVENT, archiveChanged);
  });
});
