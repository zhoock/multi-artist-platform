/**
 * UI tests for PATCH auto-renew modal flows in MyArchiveContent (PR-5).
 */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { patchSubscriptionAutoRenew } from '@shared/api/subscription';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';

import { MyArchiveContent } from '../MyArchiveContent';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const patchAutoRenewMock = jest.mocked(patchSubscriptionAutoRenew);
const isAutoRenewClientEnabledMock = jest.fn(() => true);

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  removeArtistFromArchiveApi: jest.fn(),
  activateArchiveArtistsApi: jest.fn(),
  ArchiveApiError: class ArchiveApiError extends Error {},
}));

jest.mock('@shared/api/subscription', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  createSubscriptionPaymentMethodRebind: jest.fn(),
}));

jest.mock('@shared/lib/subscription/useSubscriptionRebindPayment', () => ({
  useSubscriptionRebindPayment: () => ({
    startRebind: jest.fn(),
  }),
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
  isSubscriptionAutoRenewClientEnabled: () => isAutoRenewClientEnabledMock(),
}));

function renderMyArchive(ui: React.ReactElement) {
  return renderWithProviders(<ToastProvider>{ui}</ToastProvider>);
}

function cancelledArchivePayload() {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 1,
    inactiveCount: 0,
    subscriptionExpiresAt: '2026-09-03T00:00:00.000Z',
    billing: {
      ...EMPTY_BILLING_SNAPSHOT,
      status: 'cancel_at_period_end' as const,
      plan: 'explorer' as const,
      slotsLimit: 1,
      expiresAt: '2026-09-03T00:00:00.000Z',
      autoRenewEnabled: false,
      hasPremiumAccess: true,
    },
    artists: [
      {
        id: 'a1',
        artistUserId: 'a1',
        name: 'Artist',
        slug: 'artist',
        genreCode: 'rock',
        genreLabel: { en: 'Rock', ru: 'Рок' },
        cover: null,
        addedAt: '2026-08-01',
        isActive: true,
        isLocked: false,
        lockedUntil: null,
      },
    ],
  };
}

function activeArchivePayload() {
  return {
    ...cancelledArchivePayload(),
    billing: {
      ...cancelledArchivePayload().billing,
      status: 'active' as const,
      autoRenewEnabled: true,
      hasSavedPaymentMethod: true,
      paymentMethodTitle: 'Visa •••• 4242',
    },
  };
}

describe('MyArchiveContent billing auto-renew modals', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    patchAutoRenewMock.mockReset();
    isAutoRenewClientEnabledMock.mockReset();
    isAutoRenewClientEnabledMock.mockReturnValue(true);
  });

  test('opens enable modal from cancelled banner CTA', async () => {
    getMyArchiveMock.mockResolvedValue(cancelledArchivePayload());

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i })
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i }));

    expect(
      screen.getByRole('heading', { name: /Resume auto-renew\?|Возобновить автопродление\?/i })
    ).toBeTruthy();
  });

  test('patches auto-renew enable on confirm', async () => {
    const payload = cancelledArchivePayload();
    getMyArchiveMock.mockResolvedValueOnce(payload);
    patchAutoRenewMock.mockResolvedValueOnce({
      success: true,
      data: {
        archive: {
          ...payload,
          billing: {
            ...payload.billing,
            status: 'active',
            autoRenewEnabled: true,
          },
        },
      },
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i })
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i }));

    const confirmButton = document.querySelector(
      '.billing-modal__primary-button'
    ) as HTMLButtonElement | null;
    expect(confirmButton).toBeTruthy();
    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(patchAutoRenewMock).toHaveBeenCalledWith(true);
    });
  });

  test('opens rebind modal from payment failed banner CTA', async () => {
    getMyArchiveMock.mockResolvedValue({
      ...cancelledArchivePayload(),
      billing: {
        ...cancelledArchivePayload().billing,
        status: 'past_due' as const,
        autoRenewEnabled: false,
        hasPremiumAccess: true,
      },
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Update payment details|Обновить платёжные данные/i })
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Update payment details|Обновить платёжные данные/i })
    );

    expect(
      screen.getByRole('heading', { name: /Update payment method|Обновить способ оплаты/i })
    ).toBeTruthy();
  });

  test('hides auto-renew banner CTAs when client flag is off', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(false);
    getMyArchiveMock.mockResolvedValue(cancelledArchivePayload());

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Support cancelled|Поддержка отменена/i)).toBeTruthy();
    });

    expect(
      screen.queryByRole('button', { name: /Resume support|Возобновить поддержку/i })
    ).toBeNull();
  });

  test('maps FEATURE_DISABLED patch error to localized copy', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    patchAutoRenewMock.mockResolvedValueOnce({
      success: false,
      error: 'Auto-renew is not enabled',
      code: 'FEATURE_DISABLED',
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
    );

    const confirmButton = document.querySelector(
      '.billing-modal__primary-button'
    ) as HTMLButtonElement | null;
    expect(confirmButton).toBeTruthy();
    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(
        screen.getByText(/Could not update auto-renew|Не удалось обновить автопродление/i)
      ).toBeTruthy();
    });
    expect(screen.queryByText('Auto-renew is not enabled')).toBeNull();
  });
});
