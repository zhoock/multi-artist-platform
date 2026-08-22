/**
 * Regression tests: Artist Support modal must resolve current plan from
 * PremiumSubscriptionProvider (same as the rest of the app), not modal-local state.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';

import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import type { MyArchiveData } from '@shared/api/archive';
import type { CanonicalSubscriptionStatus } from '@shared/api/billing';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ArchiveAccessModalProvider, useArchiveAccessModal } from '../archiveAccessModalContext';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const getTokenMock = jest.fn<() => string | null>();
const getUserMock = jest.fn<() => { id: string; email: string } | null>();

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
  getUser: () => getUserMock(),
  isEmailVerified: () => true,
  subscribeAuthSession: () => () => {},
  getAuthSessionIdentityKey: () => 'user:user-1',
  getAuthSessionUserSnapshot: () => getUserMock(),
}));

jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPayment: jest.fn(),
  cancelScheduledSubscriptionDowngrade: jest.fn(),
  scheduleSubscriptionDowngrade: jest.fn(),
}));

import {
  cancelScheduledSubscriptionDowngrade,
  createSubscriptionPayment,
} from '@shared/api/subscription';

const createSubscriptionPaymentMock = jest.mocked(createSubscriptionPayment);
const cancelScheduledSubscriptionDowngradeMock = jest.mocked(cancelScheduledSubscriptionDowngrade);
const isAutoRenewClientEnabledMock = jest.fn(() => false);

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => isAutoRenewClientEnabledMock(),
}));

function OpenModalButton() {
  const { open } = useArchiveAccessModal();
  return (
    <button type="button" onClick={() => open()}>
      Open Artist Support
    </button>
  );
}

type ArchiveFixture = {
  isPremium: boolean;
  slotsUsed: number;
  slotsLimit: number;
  scheduledPlan?: 'explorer' | 'collector' | 'archivist' | null;
};

function resolvePlanFromSlotsLimit(
  slotsLimit: number
): 'explorer' | 'collector' | 'archivist' | null {
  if (slotsLimit === 20) return 'explorer';
  if (slotsLimit === 60) return 'collector';
  if (slotsLimit === 100) return 'archivist';
  return null;
}

function buildArchiveResponse(archive: ArchiveFixture): MyArchiveData {
  const plan = resolvePlanFromSlotsLimit(archive.slotsLimit);
  const status: CanonicalSubscriptionStatus = archive.isPremium ? 'active' : 'expired';

  return {
    isPremium: archive.isPremium,
    slotsUsed: archive.slotsUsed,
    slotsLimit: archive.slotsLimit,
    artists: [],
    billing: {
      status,
      plan,
      slotsLimit: archive.slotsLimit,
      expiresAt: '2099-08-07T10:00:00.000Z',
      autoRenewEnabled: true,
      hasPremiumAccess: archive.isPremium,
      hasSavedPaymentMethod: true,
      paymentMethodTitle: 'Bank card *4242',
      nextChargeAt: '2099-08-07T10:00:00.000Z',
      scheduledPlan: archive.scheduledPlan ?? null,
      renewalAttemptCount: null,
      firstFailedAt: null,
    },
  };
}

/** Production no-subscription snapshot: status null, slotsLimit = catalog max fallback (100). */
function buildNoSubscriptionArchiveResponse(slotsLimit = 100): MyArchiveData {
  return {
    isPremium: false,
    slotsUsed: 0,
    slotsLimit,
    artists: [],
    billing: {
      status: null,
      plan: null,
      slotsLimit,
      expiresAt: null,
      autoRenewEnabled: false,
      hasPremiumAccess: false,
      hasSavedPaymentMethod: false,
      paymentMethodTitle: null,
      nextChargeAt: null,
      scheduledPlan: null,
      renewalAttemptCount: null,
      firstFailedAt: null,
    },
  };
}

function renderNoSubscriptionModal(slotsLimit = 100) {
  getMyArchiveMock.mockResolvedValue(buildNoSubscriptionArchiveResponse(slotsLimit));
  getTokenMock.mockReturnValue('test-token');

  return renderWithProviders(
    <PremiumSubscriptionProvider>
      <ArchiveAccessModalProvider>
        <OpenModalButton />
      </ArchiveAccessModalProvider>
    </PremiumSubscriptionProvider>,
    { preloadedState: { lang: { current: 'en' } } }
  );
}

function renderModalWithProviderOrder(
  archive: ArchiveFixture,
  order: 'correct' | 'wrong' = 'correct'
) {
  getMyArchiveMock.mockResolvedValue(buildArchiveResponse(archive));
  getTokenMock.mockReturnValue('test-token');

  const tree =
    order === 'correct' ? (
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>
    ) : (
      <ArchiveAccessModalProvider>
        <PremiumSubscriptionProvider>
          <OpenModalButton />
        </PremiumSubscriptionProvider>
      </ArchiveAccessModalProvider>
    );

  return renderWithProviders(tree, {
    preloadedState: { lang: { current: 'en' } },
  });
}

async function openModal() {
  await waitFor(() => {
    expect(getMyArchiveMock).toHaveBeenCalled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeTruthy();
  });
}

function getPlanCard(planName: string) {
  const heading = screen.getByRole('heading', { name: planName });
  const card = heading.closest('.subscription-plan-modal__plan-card');
  if (!card) {
    throw new Error(`Plan card not found for ${planName}`);
  }
  return card as HTMLElement;
}

describe('ArchiveAccessModalView current plan', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    getTokenMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockReturnValue({ id: 'user-1', email: 'user@example.com' });
    createSubscriptionPaymentMock.mockReset();
    createSubscriptionPaymentMock.mockResolvedValue({
      success: true,
      data: { paymentId: 'pay-test-1', confirmationUrl: 'https://pay.example/checkout' },
    });
    cancelScheduledSubscriptionDowngradeMock.mockReset();
    cancelScheduledSubscriptionDowngradeMock.mockResolvedValue({
      success: true,
      data: {
        archive: buildArchiveResponse({
          isPremium: true,
          slotsUsed: 0,
          slotsLimit: 60,
        }),
      },
    });
  });

  test('highlights Explorer when Explorer is active', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    const explorerCard = getPlanCard('Explorer');
    expect(explorerCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(explorerCard).getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(
      within(explorerCard).getByText('Current Plan', {
        selector: '.subscription-plan-modal__plan-badge',
      })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Archivist')).getByRole('button', { name: 'Switch to Archivist' })
    ).toBeTruthy();
  });

  test('highlights Collector when collection is full (Upgrade Plan path)', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 60 });
    await openModal();

    const collectorCard = getPlanCard('Collector');
    expect(collectorCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(collectorCard).getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(
      within(collectorCard).getByText('Current Plan', {
        selector: '.subscription-plan-modal__plan-badge',
      })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Archivist')).getByRole('button', { name: 'Switch to Archivist' })
    ).toBeTruthy();
  });

  test('highlights Archivist when Archivist is active', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 100 });
    await openModal();

    const archivistCard = getPlanCard('Archivist');
    expect(archivistCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(archivistCard).getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(
      within(archivistCard).getByText('Current Plan', {
        selector: '.subscription-plan-modal__plan-badge',
      })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    ).toBeTruthy();
  });

  test('shows expired Collector with renew action when support is inactive', async () => {
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 1, slotsLimit: 60 });
    await openModal();

    const collectorCard = getPlanCard('Collector');
    expect(collectorCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(collectorCard).getByText('Expired')).toBeTruthy();
    expect(within(collectorCard).getByRole('button', { name: 'Renew Collector' })).toBeTruthy();
    expect(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
    ).toBeTruthy();
  });

  test('regression: refetch on open shows renew after subscription lapses', async () => {
    getMyArchiveMock
      .mockResolvedValueOnce({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 20,
        billing: {
          status: 'cancel_at_period_end',
          plan: 'explorer',
          slotsLimit: 20,
          expiresAt: '2026-08-07T10:00:00.000Z',
          autoRenewEnabled: false,
          hasPremiumAccess: true,
          hasSavedPaymentMethod: true,
          paymentMethodTitle: 'Bank card *4242',
          nextChargeAt: null,
          scheduledPlan: null,
          renewalAttemptCount: null,
          firstFailedAt: null,
        },
        artists: [],
      })
      .mockResolvedValue({
        isPremium: false,
        slotsUsed: 0,
        slotsLimit: 20,
        billing: {
          status: 'expired',
          plan: 'explorer',
          slotsLimit: 20,
          expiresAt: '2026-08-07T10:00:00.000Z',
          autoRenewEnabled: false,
          hasPremiumAccess: false,
          hasSavedPaymentMethod: true,
          paymentMethodTitle: 'Bank card *4242',
          nextChargeAt: null,
          scheduledPlan: null,
          renewalAttemptCount: null,
          firstFailedAt: null,
        },
        artists: [],
      });
    getTokenMock.mockReturnValue('test-token');

    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));

    await waitFor(() => {
      const explorerCard = getPlanCard('Explorer');
      expect(within(explorerCard).getByText('Expired')).toBeTruthy();
      expect(within(explorerCard).getByRole('button', { name: 'Renew Explorer' })).toBeEnabled();
    });
  });

  test('regression: refetch on open reflects scheduled downgrade after renewal', async () => {
    getMyArchiveMock
      .mockResolvedValueOnce({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 60,
        billing: {
          status: 'active',
          plan: 'collector',
          slotsLimit: 60,
          expiresAt: '2026-09-07T10:00:00.000Z',
          autoRenewEnabled: true,
          hasPremiumAccess: true,
          hasSavedPaymentMethod: true,
          paymentMethodTitle: 'Bank card *4242',
          nextChargeAt: '2026-08-07T10:00:00.000Z',
          scheduledPlan: 'explorer',
          renewalAttemptCount: null,
          firstFailedAt: null,
        },
        artists: [],
      })
      .mockResolvedValue({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 20,
        billing: {
          status: 'active',
          plan: 'explorer',
          slotsLimit: 20,
          expiresAt: '2026-09-07T10:00:00.000Z',
          autoRenewEnabled: true,
          hasPremiumAccess: true,
          hasSavedPaymentMethod: true,
          paymentMethodTitle: 'Bank card *4242',
          nextChargeAt: '2026-09-07T10:00:00.000Z',
          scheduledPlan: null,
          renewalAttemptCount: null,
          firstFailedAt: null,
        },
        artists: [],
      });
    getTokenMock.mockReturnValue('test-token');

    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));

    await waitFor(() => {
      const explorerCard = getPlanCard('Explorer');
      expect(explorerCard.classList.contains('dashboard-card--selected')).toBe(true);
      expect(within(explorerCard).getByRole('button', { name: 'Current Plan' })).toBeDisabled();
      expect(
        within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
      ).toBeTruthy();
    });
  });

  test('does not highlight any plan for a new user', async () => {
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 0, slotsLimit: 3 });
    await openModal();

    expect(document.querySelector('.dashboard-card--selected')).toBeNull();
    expect(document.querySelector('.subscription-plan-modal__plan-badge')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose Explorer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose Collector' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose Archivist' })).toBeTruthy();
  });

  test('regression: wrong provider order leaves modal without current plan', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 60 }, 'wrong');
    await openModal();

    expect(document.querySelector('.dashboard-card--selected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose Collector' })).toBeTruthy();
  });
});

describe('ArchiveAccessModalView guest auth redirect', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    getTokenMock.mockReset();
    getUserMock.mockReset();
    getTokenMock.mockReturnValue(null);
    getUserMock.mockReturnValue(null);
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      artists: [],
    });
    createSubscriptionPaymentMock.mockReset();
  });

  test('clears plan CTA loading after redirecting guest to auth', async () => {
    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Archivist' }));

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
      // Auth redirect closes the plan picker; view stays mounted with loading cleared.
      expect(screen.queryByRole('heading', { name: 'Choose your plan' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Choose Archivist' })).toBeEnabled();
    expect(screen.queryByText('Redirecting…')).toBeNull();
  });
});

describe('ArchiveAccessModalView plan change confirmation', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    getTokenMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockReturnValue({ id: 'user-1', email: 'user@example.com' });
    createSubscriptionPaymentMock.mockReset();
    createSubscriptionPaymentMock.mockResolvedValue({
      success: true,
      data: { paymentId: 'pay-test-1', confirmationUrl: 'https://pay.example/checkout' },
    });
    cancelScheduledSubscriptionDowngradeMock.mockReset();
    cancelScheduledSubscriptionDowngradeMock.mockResolvedValue({
      success: true,
      data: {
        archive: buildArchiveResponse({
          isPremium: true,
          slotsUsed: 0,
          slotsLimit: 60,
        }),
      },
    });
  });

  test('shows compact confirmation modal when switching plans', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );

    expect(screen.getByRole('heading', { name: 'Switch to the Collector plan?' })).toBeTruthy();
    expect(
      screen.getByText(/After payment, your current collection will become inactive/i)
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upgrade to Collector?' })).toBeNull();
    expect(screen.queryByText('Due today')).toBeNull();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('cancel closes confirmation without starting checkout', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Switch to the Collector plan?' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Upgrade to Collector?' })).toBeNull();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('confirm proceeds to checkout for selected plan', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Proceed to payment' }));

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'collector', intent: 'upgrade' })
      );
    });
  });

  test('passes upgrade intent when auto-renew flag is on', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Proceed to payment' }));

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'collector', intent: 'upgrade' })
      );
    });
  });

  test('passes upgrade intent through compact confirm when billing snapshot is stale', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 20,
      artists: [],
      billing: {
        status: 'active',
        plan: 'explorer',
        slotsLimit: 20,
        expiresAt: '2099-08-07T10:00:00.000Z',
        autoRenewEnabled: true,
        hasPremiumAccess: false,
        hasSavedPaymentMethod: true,
        paymentMethodTitle: 'Bank card *4242',
        nextChargeAt: '2099-08-07T10:00:00.000Z',
        scheduledPlan: null,
        renewalAttemptCount: null,
        firstFailedAt: null,
      },
    });
    getTokenMock.mockReturnValue('test-token');

    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeTruthy();
    });

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Proceed to payment' }));

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'collector', intent: 'upgrade' })
      );
    });
  });

  test('expired subscription shows compact confirmation when switching to Collector', async () => {
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );

    expect(screen.getByRole('heading', { name: 'Switch to the Collector plan?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upgrade to Collector?' })).toBeNull();
    expect(screen.queryByText('Due today')).toBeNull();
  });

  test('renew current plan skips confirmation modal', async () => {
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 1, slotsLimit: 60 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Renew Collector' })
    );

    expect(screen.queryByRole('heading', { name: 'Switch to the Collector plan?' })).toBeNull();

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'collector' })
      );
    });
  });

  test('first plan purchase skips confirmation modal', async () => {
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 0, slotsLimit: 3 });
    await openModal();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Explorer' }));

    expect(screen.queryByRole('heading', { name: 'Switch to the Collector plan?' })).toBeNull();

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'explorer' })
      );
    });
  });

  test('new user with production slots fallback goes straight to initial checkout', async () => {
    createSubscriptionPaymentMock.mockResolvedValue({
      success: true,
      data: { paymentId: 'pay-test-1', confirmationUrl: 'https://pay.example/checkout' },
    });

    renderNoSubscriptionModal(100);
    await openModal();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Explorer' }));

    expect(screen.queryByRole('heading', { name: 'Switch to the Explorer plan?' })).toBeNull();
    expect(screen.queryByText('Current plan')).toBeNull();

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'explorer' })
      );
    });
    expect(createSubscriptionPaymentMock.mock.calls[0]?.[0]?.intent).toBeUndefined();
  });

  test.each([
    ['Explorer', 'explorer'],
    ['Collector', 'collector'],
    ['Archivist', 'archivist'],
  ])(
    'new user choosing %s skips plan-change modal (slotsLimit fallback)',
    async (planName, planSlug) => {
      createSubscriptionPaymentMock.mockResolvedValue({
        success: true,
        data: { paymentId: 'pay-test-1', confirmationUrl: 'https://pay.example/checkout' },
      });

      renderNoSubscriptionModal(100);
      await openModal();

      fireEvent.click(screen.getByRole('button', { name: `Choose ${planName}` }));

      expect(screen.queryByRole('heading', { name: `Switch to the ${planName} plan?` })).toBeNull();

      await waitFor(() => {
        expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
          expect.objectContaining({ plan: planSlug })
        );
      });
    }
  );

  test('active Explorer → Collector shows plan-change modal', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );

    expect(screen.getByRole('heading', { name: 'Switch to the Collector plan?' })).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('active Archivist → Explorer shows plan-change modal', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 100 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
    );

    expect(screen.getByRole('heading', { name: 'Switch to Explorer next period?' })).toBeTruthy();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });
});

describe('ArchiveAccessModalView pricing autopayment disclosure', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    getTokenMock.mockReset();
    getUserMock.mockReset();
    createSubscriptionPaymentMock.mockReset();
    getTokenMock.mockReturnValue('token-1');
    getUserMock.mockReturnValue({ id: 'user-1', email: 'user@example.com' });
    getMyArchiveMock.mockResolvedValue(
      buildArchiveResponse({ isPremium: false, slotsUsed: 0, slotsLimit: 3 })
    );
  });

  test('shows compact disclosure below plan cards when auto-renew flag is on', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 0, slotsLimit: 3 });
    await openModal();

    expect(screen.getByRole('note')).toBeTruthy();
    expect(
      screen.getByText(
        /Auto-renewal: when you pay for the selected plan, your payment method will be saved/
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/The next charge will be at the selected plan price every 30 days/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        /On the YooKassa page you will separately confirm saving your payment method/
      )
    ).toBeTruthy();
    expect(
      document.querySelector(
        '.subscription-plan-modal__plan-card .subscription-plan-modal__autopayment-note'
      )
    ).toBeNull();
  });

  test('hides disclosure when auto-renew flag is off', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(false);
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 0, slotsLimit: 3 });
    await openModal();

    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/Auto-renewal: when you pay for the selected plan/i)).toBeNull();
  });

  test('direct checkout CTA still starts payment without extra modal when flag is on', async () => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
    createSubscriptionPaymentMock.mockResolvedValue({
      success: true,
      data: { paymentId: 'pay-test-1', confirmationUrl: 'https://pay.example/checkout' },
    });

    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 0, slotsLimit: 3 });
    await openModal();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Explorer' }));

    await waitFor(() => {
      expect(createSubscriptionPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'explorer' })
      );
    });
    expect(screen.queryByRole('heading', { name: 'Subscribe to Explorer?' })).toBeNull();
  });
});

describe('ArchiveAccessModalView scheduled plan change', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    getTokenMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockReturnValue({ id: 'user-1', email: 'user@example.com' });
    createSubscriptionPaymentMock.mockReset();
    cancelScheduledSubscriptionDowngradeMock.mockReset();
    cancelScheduledSubscriptionDowngradeMock.mockResolvedValue({
      success: true,
      data: {
        archive: buildArchiveResponse({
          isPremium: true,
          slotsUsed: 0,
          slotsLimit: 60,
        }),
      },
    });
  });

  test('shows banner and cancel change on target plan while downgrade is scheduled', async () => {
    getMyArchiveMock.mockResolvedValue(
      buildArchiveResponse({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 60,
        scheduledPlan: 'explorer',
      })
    );
    getTokenMock.mockReturnValue('test-token');

    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));

    await waitFor(() => {
      expect(screen.getByText('Transition to Explorer scheduled')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy();
    });

    const collectorCard = getPlanCard('Collector');
    expect(collectorCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(collectorCard).getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Cancel change' })
    ).toBeTruthy();
    expect(
      within(getPlanCard('Archivist')).getByRole('button', { name: 'Switch to Archivist' })
    ).toBeTruthy();
  });

  test('cancel change clears scheduled downgrade UI', async () => {
    let scheduledPlan: 'explorer' | null = 'explorer';
    getMyArchiveMock.mockImplementation(async () =>
      buildArchiveResponse({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 60,
        scheduledPlan,
      })
    );
    cancelScheduledSubscriptionDowngradeMock.mockImplementation(async () => {
      scheduledPlan = null;
      return {
        success: true,
        data: {
          archive: buildArchiveResponse({
            isPremium: true,
            slotsUsed: 0,
            slotsLimit: 60,
            scheduledPlan: null,
          }),
        },
      };
    });
    getTokenMock.mockReturnValue('test-token');

    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenModalButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>,
      { preloadedState: { lang: { current: 'en' } } }
    );

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Artist Support' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel change' })).toBeTruthy();
    });

    fireEvent.click(within(getPlanCard('Explorer')).getByRole('button', { name: 'Cancel change' }));

    await waitFor(() => {
      expect(cancelScheduledSubscriptionDowngradeMock).toHaveBeenCalled();
      expect(screen.queryByText('Transition to Explorer scheduled')).toBeNull();
      expect(
        within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
      ).toBeTruthy();
    });
  });
});
