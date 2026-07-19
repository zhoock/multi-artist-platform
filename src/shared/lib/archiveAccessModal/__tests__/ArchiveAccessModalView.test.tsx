/**
 * Regression tests: Artist Support modal must resolve current plan from
 * PremiumSubscriptionProvider (same as the rest of the app), not modal-local state.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';

import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
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
}));

import { createSubscriptionPayment } from '@shared/api/subscription';

const createSubscriptionPaymentMock = jest.mocked(createSubscriptionPayment);

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
};

function renderModalWithProviderOrder(
  archive: ArchiveFixture,
  order: 'correct' | 'wrong' = 'correct'
) {
  getMyArchiveMock.mockResolvedValue({ ...archive, artists: [] });
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
  });

  test('highlights Explorer when Explorer is active', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 1 });
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
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 2 });
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
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 3 });
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
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 1, slotsLimit: 2 });
    await openModal();

    const collectorCard = getPlanCard('Collector');
    expect(collectorCard.classList.contains('dashboard-card--selected')).toBe(true);
    expect(within(collectorCard).getByText('Expired')).toBeTruthy();
    expect(within(collectorCard).getByRole('button', { name: 'Renew Collector' })).toBeTruthy();
    expect(
      within(getPlanCard('Explorer')).getByRole('button', { name: 'Switch to Explorer' })
    ).toBeTruthy();
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
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 2, slotsLimit: 2 }, 'wrong');
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
  });

  test('shows confirmation modal when switching plans', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 1 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );

    expect(screen.getByRole('heading', { name: 'Switch to the Collector plan?' })).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
    expect(screen.getByText('New plan')).toBeTruthy();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('cancel closes confirmation without starting checkout', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 1 });
    await openModal();

    fireEvent.click(
      within(getPlanCard('Collector')).getByRole('button', { name: 'Switch to Collector' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Switch to the Collector plan?' })).toBeNull();
    expect(createSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  test('confirm proceeds to checkout for selected plan', async () => {
    renderModalWithProviderOrder({ isPremium: true, slotsUsed: 1, slotsLimit: 1 });
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
    renderModalWithProviderOrder({ isPremium: false, slotsUsed: 1, slotsLimit: 2 });
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
