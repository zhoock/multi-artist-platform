/**
 * UI tests for plan display and contextual plan actions in MyArchiveContent.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';
import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import { resetToastStoreForTests } from '@shared/lib/toast/toastStore';
import { removeArtistFromArchiveApi, activateArchiveArtistsApi } from '@shared/api/archive';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { MyArchiveContent } from '../MyArchiveContent';
import type { SubscriptionCheckoutResult } from '@shared/lib/archiveAccessModal/useSubscriptionCheckout';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const removeArtistFromArchiveApiMock = jest.mocked(removeArtistFromArchiveApi);
const activateArchiveArtistsApiMock = jest.mocked(activateArchiveArtistsApi);
const openSupportModalMock = jest.fn();
const startCheckoutMock = jest.fn<(planSlug: string) => Promise<SubscriptionCheckoutResult>>();

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  removeArtistFromArchiveApi: jest.fn(),
  activateArchiveArtistsApi: jest.fn(),
  ArchiveApiError: class ArchiveApiError extends Error {},
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

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
}));

function renderMyArchive(ui: React.ReactElement) {
  return renderWithProviders(
    <PremiumSubscriptionProvider>
      <ToastProvider>{ui}</ToastProvider>
    </PremiumSubscriptionProvider>
  );
}

function inactiveArtist(id: string, name: string) {
  return {
    id,
    artistUserId: id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    genreCode: 'rock',
    genreLabel: { en: 'Rock', ru: 'Рок' },
    cover: null,
    addedAt: '2026-01-01',
    isActive: false,
    isLocked: false,
    lockedUntil: null,
  };
}

function activeArtist(
  id: string,
  name: string,
  options: { isLocked?: boolean; lockedUntil?: string | null } = {}
) {
  return {
    ...inactiveArtist(id, name),
    isActive: true,
    isLocked: options.isLocked ?? false,
    lockedUntil: options.lockedUntil ?? null,
  };
}

function billingActive(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'active',
    plan: 'explorer',
    slotsLimit: 1,
    expiresAt: '2026-08-03T12:00:00.000Z',
    nextChargeAt: '2026-08-03T12:00:00.000Z',
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
    autoRenewEnabled: false,
    ...overrides,
  };
}

function archivePayload(overrides: Record<string, unknown> = {}) {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 1,
    inactiveCount: 0,
    subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
    billing: billingActive(),
    artists: [],
    ...overrides,
  };
}

describe('MyArchiveContent collection', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    removeArtistFromArchiveApiMock.mockReset();
    activateArchiveArtistsApiMock.mockReset();
    openSupportModalMock.mockReset();
    startCheckoutMock.mockReset();
    startCheckoutMock.mockResolvedValue({ ok: true, redirected: 'payment' });
    resetToastStoreForTests();
  });

  test('shows expired banner with choose plan action and no billing cards', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        isPremium: false,
        slotsUsed: 1,
        slotsLimit: 20,
        billing: billingExpired({ plan: 'archivist', slotsLimit: 20 }),
        artists: [activeArtist('a1', 'Beatles')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Support ended|Поддержка завершена/i)).toBeTruthy();
    });

    expect(
      screen.getByText(
        /Artists will remain in your collection|Артисты останутся в вашей коллекции/i
      )
    ).toBeTruthy();
    expect(document.querySelector('.collection-billing__banner--error')).toBeTruthy();
    expect(document.querySelector('.collection-billing__plan-card')).toBeNull();
    expect(screen.getByText(/1 of 20|1 из 20/)).toBeTruthy();
    expect(screen.getByText('Beatles')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Choose a plan|Выбрать тариф/i }));
    expect(openSupportModalMock).toHaveBeenCalled();
  });

  test('shows expired banner on empty collection without billing UI', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 20,
      inactiveCount: 0,
      subscriptionExpiresAt: null,
      billing: billingExpired({ plan: 'archivist', slotsLimit: 20 }),
      artists: [],
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Support ended|Поддержка завершена/i)).toBeTruthy();
    });

    expect(screen.getByText(/Your collection is empty|Ваша коллекция пуста/i)).toBeTruthy();
    expect(document.querySelector('.collection-billing__plan-card')).toBeNull();
    expect(screen.queryByRole('button', { name: /Change$|Сменить$/ })).toBeNull();
  });

  test('shows inactive toolbar when plan changed and inactive artists remain', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 2,
        artists: [inactiveArtist('a1', 'Artist One'), inactiveArtist('a2', 'Artist Two')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('2 inactive artists')).toBeTruthy();
    });

    expect(screen.queryByText(/Previously supported artists are now inactive/i)).toBeNull();
  });

  test('shows empty collection without billing plan cards', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: null,
      billing: billingNone(),
      artists: [],
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Your collection is empty|Ваша коллекция пуста/i)).toBeTruthy();
    });

    expect(screen.getByText(/0 of 3|0 из 3/)).toBeTruthy();
    expect(document.querySelector('.collection-billing__plan-card')).toBeNull();
    expect(screen.queryByRole('button', { name: /Change$|Сменить$/ })).toBeNull();
  });

  test('shows icon-only remove button for active unlocked artist', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        artists: [activeArtist('a1', 'Active Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(screen.queryByText('Can be removed')).toBeNull();
    expect(screen.queryByText('You can remove this artist at any time.')).toBeNull();
    expect(screen.queryByText(/In Collection since/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('shows lock action with tooltip for locked active artist without status badges', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        subscriptionExpiresAt: '2026-07-20T12:00:00.000Z',
        billing: billingActive({ expiresAt: '2026-09-01T12:00:00.000Z' }),
        artists: [
          activeArtist('a1', 'Locked Artist', {
            isLocked: true,
            lockedUntil: '2026-09-01T12:00:00.000Z',
          }),
        ],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Locked Artist')).toBeTruthy();
    });

    expect(screen.queryByText(/Locked until/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toMatch(/Can be replaced in/i);
    expect(tooltip.textContent).toMatch(/30 days after being added/i);
  });

  test('shows activate and remove buttons for inactive artist', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [inactiveArtist('a1', 'Inactive Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Inactive Artist')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Activate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  test('activates inactive artist without entering select mode', async () => {
    const activatedArchive = archivePayload({
      slotsUsed: 1,
      inactiveCount: 0,
      billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
      slotsLimit: 3,
      artists: [activeArtist('a1', 'Inactive Artist')],
    });

    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [inactiveArtist('a1', 'Inactive Artist')],
      })
    );
    activateArchiveArtistsApiMock.mockResolvedValue({
      archive: activatedArchive,
      activatedCount: 1,
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Activate' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(activateArchiveArtistsApiMock).toHaveBeenCalledWith(['a1']);
      expect(screen.getByText(/1 of 3|1 из 3/)).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  test('disables activate button when no slots remain', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 3,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [
          activeArtist('a1', 'Active One'),
          activeArtist('a2', 'Active Two'),
          activeArtist('a3', 'Active Three'),
          inactiveArtist('a4', 'Inactive Artist'),
        ],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Inactive Artist')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /^Activate\b/i })).toBeDisabled();
  });

  test('shows enabled remove button for inactive artist without extra status copy', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        artists: [inactiveArtist('a1', 'Inactive Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Inactive Artist')).toBeTruthy();
    });

    expect(screen.queryByText('Support inactive')).toBeNull();
    expect(screen.queryByText('This artist no longer uses an active slot.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('shows collection empty state without subscription and no artists', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: null,
      billing: billingNone(),
      artists: [],
    });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Your collection is empty|Ваша коллекция пуста/i)).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /Find artists|Найти артистов/i })).toBeTruthy();
    expect(screen.getByText(/0 of 3|0 из 3/)).toBeTruthy();
    expect(document.querySelector('.collection-billing__plan-card')).toBeNull();
    expect(screen.queryByRole('button', { name: /Change$|Сменить$/ })).toBeNull();
  });

  test('shows slots indicator and empty state when collection is empty but subscription is active', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/0 of 3|0 из 3/)).toBeTruthy();
    });

    expect(screen.getByText('Your collection is empty')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Find artists|Найти артистов/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change$|Сменить$/ })).toBeNull();
    expect(document.querySelector('.collection__list-card')).toBeNull();
  });

  test('allows remove for inactive artist with stale lock data and no card status', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [
          {
            ...inactiveArtist('a1', 'Inactive Artist'),
            lockedUntil: '2026-07-20T12:00:00.000Z',
            isLocked: true,
          },
        ],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Inactive Artist')).toBeTruthy();
    });

    expect(screen.queryByText(/Locked until/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(document.querySelector('.collection__artist-row-wrap--selectable')!);

    expect(screen.getByRole('button', { name: 'Remove from collection' })).not.toBeDisabled();
  });

  test('does not show inactive toolbar when all artists are active', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [activeArtist('a1', 'Active Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear collection' })).toBeNull();
  });

  test('clear collection removes all inactive artists', async () => {
    const emptyArchive = archivePayload({
      slotsUsed: 0,
      inactiveCount: 0,
      billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
      slotsLimit: 3,
      artists: [],
    });
    const archiveWithInactive = archivePayload({
      slotsUsed: 0,
      inactiveCount: 2,
      billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
      slotsLimit: 3,
      artists: [inactiveArtist('a1', 'Artist One'), inactiveArtist('a2', 'Artist Two')],
    });

    getMyArchiveMock.mockResolvedValueOnce(archiveWithInactive).mockResolvedValue(emptyArchive);
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear collection' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear collection' }));

    await waitFor(() => {
      expect(removeArtistFromArchiveApiMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    });

    expect(getMyArchiveMock).toHaveBeenCalledTimes(4);
  });

  test('select mode only applies to inactive artists', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [activeArtist('a1', 'Active Artist'), inactiveArtist('a2', 'Inactive Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    const selectableRows = document.querySelectorAll('.collection__artist-row-wrap--selectable');
    expect(selectableRows.length).toBe(1);
    expect(selectableRows[0]?.textContent).toContain('Inactive Artist');
  });

  test('done exits select mode', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [inactiveArtist('a1', 'Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(document.querySelector('.collection__action-bar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(document.querySelector('.collection__action-bar')).toBeNull();
  });

  test('shows toast after removing a single artist', async () => {
    const emptyArchive = archivePayload({
      slotsUsed: 0,
      inactiveCount: 0,
      billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
      slotsLimit: 3,
      artists: [],
    });

    getMyArchiveMock.mockResolvedValueOnce(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
        slotsLimit: 3,
        artists: [inactiveArtist('a1', 'Inactive Artist')],
      })
    );
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Artist removed from collection')).toBeTruthy();
    });

    expect(getMyArchiveMock).toHaveBeenCalledTimes(3);
  });

  test('shows collection cleared toast after clear collection', async () => {
    const emptyArchive = archivePayload({
      slotsUsed: 0,
      inactiveCount: 0,
      billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
      slotsLimit: 3,
      artists: [],
    });

    getMyArchiveMock
      .mockResolvedValueOnce(
        archivePayload({
          slotsUsed: 0,
          inactiveCount: 1,
          billing: billingActive({ plan: 'archivist', slotsLimit: 3 }),
          slotsLimit: 3,
          artists: [inactiveArtist('a1', 'Inactive Artist')],
        })
      )
      .mockResolvedValue(emptyArchive);
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear collection' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear collection' }));

    await waitFor(() => {
      expect(screen.getByText('Collection cleared')).toBeTruthy();
    });
  });

  test('renders minimalist artist cards with delete action', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        artists: [activeArtist('a1', 'Active Artist')],
      })
    );

    const { container } = renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(container.querySelector('.user-dashboard__section')).toBeTruthy();
    expect(container.querySelector('.user-dashboard__albums-list')).toBeTruthy();
    expect(container.querySelector('.collection-billing__usage-card')).toBeTruthy();
    expect(container.querySelector('.collection-billing__plan-cards')).toBeNull();
    expect(container.querySelector('.collection__list-card.dashboard-card')).toBeTruthy();
    expect(container.querySelector('.collection__artist-row')).toBeTruthy();
    expect(container.querySelector('.collection__artist-row .status-badge')).toBeNull();
    expect(
      container.querySelector('.collection__remove-action.dashboard-button--destructive')
    ).toBeTruthy();
  });

  test('select mode shows bottom action bar', async () => {
    getMyArchiveMock.mockResolvedValue(
      archivePayload({
        slotsUsed: 0,
        inactiveCount: 1,
        artists: [inactiveArtist('a1', 'Artist')],
      })
    );

    renderMyArchive(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate (0)' })).toBeTruthy();
  });
});
