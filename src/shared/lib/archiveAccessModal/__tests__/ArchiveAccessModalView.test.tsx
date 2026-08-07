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

  test('shows confirmation modal when switching plans', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );

    expect(screen.getByRole('heading', { name: 'Upgrade to Collector?' })).toBeTruthy();
    expect(screen.getByText(/Current plan:/i)).toBeTruthy();
    expect(screen.getByText(/New plan:/i)).toBeTruthy();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('cancel closes confirmation without starting checkout', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 20 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

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
        expect.objectContaining({ plan: 'collector' })
      );
    });
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
