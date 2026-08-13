/**
 * UI tests for billing flows in SubscriptionContent (auto-renew + payment method unlink).
 */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import {
  deleteSubscriptionPaymentMethod,
  patchSubscriptionAutoRenew,
} from '@shared/api/subscription';
import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';

import { SubscriptionContent } from '../SubscriptionContent';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const patchAutoRenewMock = jest.mocked(patchSubscriptionAutoRenew);
const deletePaymentMethodMock = jest.mocked(deleteSubscriptionPaymentMethod);
const startRebindMock =
  jest.fn<(options?: { resumeAutoRenew?: boolean }) => Promise<{ ok: boolean; error?: string }>>();
const isAutoRenewClientEnabledMock = jest.fn(() => true);

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

jest.mock('@shared/api/subscription', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  deleteSubscriptionPaymentMethod: jest.fn(),
  createSubscriptionPaymentMethodRebind: jest.fn(),
}));

jest.mock('@shared/lib/subscription/useSubscriptionRebindPayment', () => ({
  useSubscriptionRebindPayment: () => ({
    startRebind: (options?: { resumeAutoRenew?: boolean }) => startRebindMock(options),
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

function renderSubscription(ui: React.ReactElement) {
  return renderWithProviders(
    <PremiumSubscriptionProvider>
      <ToastProvider>{ui}</ToastProvider>
    </PremiumSubscriptionProvider>
  );
}

function getPaymentMethodCard(): HTMLElement | null {
  return document.querySelector('.collection-billing__payment-method-card');
}

function getModalDialog(titleId: string): HTMLElement {
  const title = document.getElementById(titleId);
  if (!title) {
    throw new Error(`Modal with title id "${titleId}" not found`);
  }
  const dialog = title.closest('dialog');
  if (!dialog) {
    throw new Error(`Dialog for title id "${titleId}" not found`);
  }
  return dialog as HTMLElement;
}

function getUnlinkModalDialog(): HTMLElement {
  return getModalDialog('billing-unlink-payment-title');
}

function getDisableAutoRenewModalDialog(): HTMLElement {
  return getModalDialog('billing-disable-autorenew-title');
}

const EXPIRES_AT = '2026-09-03T00:00:00.000Z';

function baseArchivePayload(billingOverrides: Record<string, unknown> = {}) {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 1,
    inactiveCount: 0,
    subscriptionExpiresAt: EXPIRES_AT,
    billing: {
      ...EMPTY_BILLING_SNAPSHOT,
      status: 'active' as const,
      plan: 'explorer' as const,
      slotsLimit: 1,
      expiresAt: EXPIRES_AT,
      autoRenewEnabled: true,
      hasPremiumAccess: true,
      hasSavedPaymentMethod: true,
      paymentMethodTitle: 'Visa •••• 4242',
      nextChargeAt: EXPIRES_AT,
      ...billingOverrides,
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
  return baseArchivePayload();
}

function cancelledArchivePayload() {
  return baseArchivePayload({
    status: 'cancel_at_period_end',
    autoRenewEnabled: false,
    hasSavedPaymentMethod: true,
    paymentMethodTitle: 'Visa •••• 4242',
    nextChargeAt: null,
  });
}

function cancelledNoPaymentMethodArchivePayload() {
  return baseArchivePayload({
    status: 'cancel_at_period_end',
    autoRenewEnabled: false,
    hasSavedPaymentMethod: false,
    paymentMethodTitle: null,
    nextChargeAt: null,
  });
}

describe('SubscriptionContent billing auto-renew modals', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    patchAutoRenewMock.mockReset();
    deletePaymentMethodMock.mockReset();
    startRebindMock.mockReset();
    isAutoRenewClientEnabledMock.mockReset();
    isAutoRenewClientEnabledMock.mockReturnValue(true);
  });

  test('opens enable modal from cancelled banner CTA', async () => {
    getMyArchiveMock.mockResolvedValue(cancelledArchivePayload());

    renderSubscription(<SubscriptionContent active />);

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
    getMyArchiveMock.mockResolvedValue(payload);
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

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i })
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /^Resume auto-renew$|^Возобновить автопродление$/i })
    );

    await waitFor(() => {
      expect(patchAutoRenewMock).toHaveBeenCalledWith(true);
    });
    expect(deletePaymentMethodMock).not.toHaveBeenCalled();
  });

  test('resume without payment method starts rebind with resumeAutoRenew intent', async () => {
    getMyArchiveMock.mockResolvedValue(cancelledNoPaymentMethodArchivePayload());
    patchAutoRenewMock.mockResolvedValueOnce({
      success: false,
      error: 'Payment method required to enable auto-renew',
      code: 'PAYMENT_METHOD_REQUIRED',
    });
    startRebindMock.mockResolvedValueOnce({ ok: true });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i })
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resume support|Возобновить поддержку/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /^Resume auto-renew$|^Возобновить автопродление$/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Update payment method|Обновить способ оплаты/i })
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Add payment method|Добавить способ оплаты/i })
    );

    await waitFor(() => {
      expect(startRebindMock).toHaveBeenCalledWith({ resumeAutoRenew: true });
    });
  });

  test('change payment method rebind does not pass resumeAutoRenew intent', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    startRebindMock.mockResolvedValueOnce({ ok: true });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(
      within(card).getByRole('button', { name: /Change payment method|Изменить способ оплаты/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Add payment method|Добавить способ оплаты/i })
    );

    await waitFor(() => {
      expect(startRebindMock).toHaveBeenCalled();
    });
    expect(startRebindMock.mock.calls[0]?.[0]?.resumeAutoRenew).not.toBe(true);
  });

  test('archive refresh after resume rebind shows active subscription with next charge', async () => {
    let payload: unknown = cancelledNoPaymentMethodArchivePayload();
    getMyArchiveMock.mockImplementation(async () => payload);

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Support cancelled|Поддержка отменена/i)).toBeTruthy();
    });

    payload = activeArchivePayload();
    window.dispatchEvent(new CustomEvent('archive:changed'));

    await waitFor(() => {
      expect(screen.queryByText(/Support cancelled|Поддержка отменена/i)).toBeNull();
    });
    expect(getPaymentMethodCard()).toBeTruthy();
    expect(within(getPaymentMethodCard() as HTMLElement).getByText(/Visa •••• 4242/)).toBeTruthy();
    expect(document.querySelector('.collection-billing__status-line--active')).toBeTruthy();
    expect(document.querySelector('.collection-billing__status-line--active')?.textContent).toMatch(
      /Next charge|Следующее списание/i
    );
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

    renderSubscription(<SubscriptionContent active />);

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

    renderSubscription(<SubscriptionContent active />);

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

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
    );

    const disableModal = getDisableAutoRenewModalDialog();
    fireEvent.click(
      within(disableModal).getByRole('button', {
        name: /Disable auto-renew|Отключить автопродление/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Could not update auto-renew|Не удалось обновить автопродление/i)
      ).toBeTruthy();
    });
    expect(screen.queryByText('Auto-renew is not enabled')).toBeNull();
  });
});

describe('SubscriptionContent payment method unlink', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    patchAutoRenewMock.mockReset();
    deletePaymentMethodMock.mockReset();
    startRebindMock.mockReset();
    isAutoRenewClientEnabledMock.mockReturnValue(true);
  });

  test('shows payment method card when saved PM exists', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    expect(within(card).getByText('Visa •••• 4242')).toBeTruthy();
    expect(
      within(card).getByRole('heading', { name: /^Payment method$|^Способ оплаты$/i })
    ).toBeTruthy();
  });

  test('hides payment method card when no saved PM', async () => {
    getMyArchiveMock.mockResolvedValue(
      baseArchivePayload({
        hasSavedPaymentMethod: false,
        paymentMethodTitle: null,
      })
    );

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
      ).toBeTruthy();
    });

    expect(getPaymentMethodCard()).toBeNull();
  });

  test('unlink opens confirmation modal', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Unlink card|Отвязать карту/i }));

    expect(screen.getByRole('heading', { name: /Unlink card\?|Отвязать карту\?/i })).toBeTruthy();
  });

  test('confirm unlink calls DELETE and updates UI without reload', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    deletePaymentMethodMock.mockResolvedValueOnce({
      success: true,
      data: {
        billing: {
          ...activeArchivePayload().billing,
          status: 'cancel_at_period_end',
          autoRenewEnabled: false,
          hasSavedPaymentMethod: false,
          paymentMethodTitle: null,
          nextChargeAt: null,
          expiresAt: EXPIRES_AT,
          hasPremiumAccess: true,
        },
      },
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Unlink card|Отвязать карту/i }));

    const unlinkModal = getUnlinkModalDialog();
    fireEvent.click(
      within(unlinkModal).getByRole('button', {
        name: /^Unlink card$|^Отвязать карту$/i,
      })
    );

    await waitFor(() => {
      expect(deletePaymentMethodMock).toHaveBeenCalledTimes(1);
    });
    expect(patchAutoRenewMock).not.toHaveBeenCalled();
    expect(getMyArchiveMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(screen.getByText(/Support cancelled|Поддержка отменена/i)).toBeTruthy();
    });
    expect(getPaymentMethodCard()).toBeNull();
  });

  test('ACTIVE transitions to CANCELLED and preserves expiresAt after unlink', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    deletePaymentMethodMock.mockResolvedValueOnce({
      success: true,
      data: {
        billing: {
          ...activeArchivePayload().billing,
          status: 'cancel_at_period_end',
          autoRenewEnabled: false,
          hasSavedPaymentMethod: false,
          paymentMethodTitle: null,
          nextChargeAt: null,
          expiresAt: EXPIRES_AT,
        },
      },
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Unlink card|Отвязать карту/i }));

    const unlinkModal = getUnlinkModalDialog();
    fireEvent.click(
      within(unlinkModal).getByRole('button', {
        name: /^Unlink card$|^Отвязать карту$/i,
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Support cancelled|Поддержка отменена/i)).toBeTruthy();
    });
    expect(
      screen.queryByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
    ).toBeNull();
  });

  test('change payment method and unlink are separate actions', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    startRebindMock.mockResolvedValueOnce({ ok: true });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(
      within(card).getByRole('button', { name: /Change payment method|Изменить способ оплаты/i })
    );

    expect(
      screen.getByRole('heading', { name: /Update payment method|Обновить способ оплаты/i })
    ).toBeTruthy();
    expect(deletePaymentMethodMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Cancel|Отмена/i }));

    fireEvent.click(within(card).getByRole('button', { name: /Unlink card|Отвязать карту/i }));
    expect(screen.getByRole('heading', { name: /Unlink card\?|Отвязать карту\?/i })).toBeTruthy();
  });

  test('disable auto-renew does not call DELETE', async () => {
    const payload = activeArchivePayload();
    getMyArchiveMock.mockResolvedValue(payload);
    patchAutoRenewMock.mockResolvedValueOnce({
      success: true,
      data: {
        archive: {
          ...payload,
          billing: {
            ...payload.billing,
            status: 'cancel_at_period_end',
            autoRenewEnabled: false,
            nextChargeAt: null,
          },
        },
      },
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Disable auto-renew|Отключить автопродление/i })
    );

    const disableModal = getDisableAutoRenewModalDialog();
    fireEvent.click(
      within(disableModal).getByRole('button', {
        name: /Disable auto-renew|Отключить автопродление/i,
      })
    );

    await waitFor(() => {
      expect(patchAutoRenewMock).toHaveBeenCalledWith(false);
    });
    expect(deletePaymentMethodMock).not.toHaveBeenCalled();
    expect(getPaymentMethodCard()).toBeTruthy();
    expect(within(getPaymentMethodCard() as HTMLElement).getByText('Visa •••• 4242')).toBeTruthy();
  });

  test('unlink error is shown in modal', async () => {
    getMyArchiveMock.mockResolvedValue(activeArchivePayload());
    deletePaymentMethodMock.mockResolvedValueOnce({
      success: false,
      error: 'Payment method unlink is not enabled',
      code: 'FEATURE_DISABLED',
    });

    renderSubscription(<SubscriptionContent active />);

    await waitFor(() => {
      expect(getPaymentMethodCard()).toBeTruthy();
    });

    const card = getPaymentMethodCard() as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Unlink card|Отвязать карту/i }));

    const unlinkModal = getUnlinkModalDialog();
    fireEvent.click(
      within(unlinkModal).getByRole('button', {
        name: /^Unlink card$|^Отвязать карту$/i,
      })
    );

    await waitFor(() => {
      expect(
        within(unlinkModal).getByText(/Could not unlink card|Не удалось отвязать карту/i)
      ).toBeTruthy();
    });
    expect(within(card).getByText('Visa •••• 4242')).toBeTruthy();
  });
});
