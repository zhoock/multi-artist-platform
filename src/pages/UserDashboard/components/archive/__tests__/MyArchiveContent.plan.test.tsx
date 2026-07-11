/**
 * UI tests for plan display and contextual plan actions in MyArchiveContent.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { removeArtistFromArchiveApi } from '@shared/api/archive';
import { MyArchiveContent } from '../MyArchiveContent';
import type { SubscriptionCheckoutResult } from '@shared/lib/archiveAccessModal/useSubscriptionCheckout';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const removeArtistFromArchiveApiMock = jest.mocked(removeArtistFromArchiveApi);
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

function inactiveArtist(id: string, name: string) {
  return {
    id,
    artistUserId: id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
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

describe('MyArchiveContent plan display', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    removeArtistFromArchiveApiMock.mockReset();
    openSupportModalMock.mockReset();
    startCheckoutMock.mockReset();
    startCheckoutMock.mockResolvedValue({ ok: true, redirected: true });
  });

  test('shows two-column header with plan and subscription status when active', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-07-22T12:00:00.000Z',
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Explorer')).toBeTruthy();
    });

    expect(screen.getByText(/1 \/ 1/)).toBeTruthy();
    expect(screen.queryByText('Subscription active')).toBeNull();
    expect(screen.getByText(/Valid until/i)).toBeTruthy();
    expect(screen.getByText(/days left/i)).toBeTruthy();
    expect(document.querySelector('.collection__summary')).toBeTruthy();
    expect(document.querySelector('.collection__summary--active')).toBeTruthy();
    expect(screen.queryByText(/Previously supported artists are now inactive/i)).toBeNull();
    expect(screen.queryByText('Collection Full')).toBeNull();
  });

  test('shows expiring subscription state in header without banner', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-07-13T12:00:00.000Z',
      artists: [activeArtist('a1', 'Active Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/days left/i)).toBeTruthy();
    });

    expect(document.querySelector('.collection__summary--expiring')).toBeTruthy();
    expect(screen.queryByText('Subscription ending')).toBeNull();
    expect(screen.queryByText('Collection Full')).toBeNull();
  });

  test('shows inactive toolbar when plan changed and inactive artists remain', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 2,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Artist One'), inactiveArtist('a2', 'Artist Two')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Explorer')).toBeTruthy();
    });

    expect(screen.getByText('2 inactive artists')).toBeTruthy();
    expect(screen.queryByText(/Previously supported artists are now inactive/i)).toBeNull();
  });

  test('hides plan badge when user has no subscription history', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: null,
      artists: [],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Your collection is empty')).toBeTruthy();
    });

    expect(screen.queryByText('Archivist')).toBeNull();
    expect(screen.queryByText('Explorer')).toBeNull();
    expect(document.querySelector('.collection__summary')).toBeNull();
  });

  test('shows renew support action only in subscription header when support is inactive', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-06-01T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renew subscription' })).toBeTruthy();
    });

    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('Access to exclusive content is suspended.')).toBeTruthy();
    expect(document.querySelector('.collection__summary--expired')).toBeTruthy();
    expect(document.querySelector('.collection__summary .status-badge')).toBeNull();
    expect(document.querySelector('.collection__card--renew')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Renew subscription' }));

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith('explorer');
    });

    expect(openSupportModalMock).not.toHaveBeenCalled();
  });

  test('shows no renew or upgrade actions when support is active and slots remain', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 2,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2/)).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renew subscription' })).toBeNull();
  });

  test('shows icon-only remove button for active unlocked artist', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Active Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(screen.queryByText('Can be removed')).toBeNull();
    expect(screen.queryByText('You can remove this artist at any time.')).toBeNull();
    expect(screen.queryByText(/In Collection since/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('shows disabled remove button for locked active artist without status badges', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-07-20T12:00:00.000Z',
      artists: [
        activeArtist('a1', 'Locked Artist', {
          isLocked: true,
          lockedUntil: '2026-07-20T12:00:00.000Z',
        }),
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Locked Artist')).toBeTruthy();
    });

    expect(screen.queryByText(/Locked until/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^Remove\b/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove\b/i })).toBeDisabled();
  });

  test('shows enabled remove button for inactive artist without extra status copy', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Inactive Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Inactive Artist')).toBeTruthy();
    });

    expect(screen.queryByText('Support inactive')).toBeNull();
    expect(screen.queryByText('This artist no longer uses an active slot.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('opens plan modal when change plan button is clicked', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 2,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Change plan' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows collection empty state without subscription and no artists', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: null,
      artists: [],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Your collection is empty')).toBeTruthy();
    });

    expect(screen.getByRole('link', { name: 'Discover Artists' })).toBeTruthy();
    expect(screen.queryByText('Manage Plan →')).toBeNull();
    expect(screen.queryByText('0/3')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change plan' })).toBeNull();
  });

  test('shows header when collection is empty but subscription is active', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/0 \/ 3/)).toBeTruthy();
    });

    expect(screen.queryByText('Your collection is empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change plan' })).toBeTruthy();
    expect(screen.queryByText('Subscription active')).toBeNull();
  });

  test('allows remove for inactive artist with stale lock data and no card status', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [
        {
          ...inactiveArtist('a1', 'Inactive Artist'),
          lockedUntil: '2026-07-20T12:00:00.000Z',
          isLocked: true,
        },
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

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
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Active Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear collection' })).toBeNull();
  });

  test('clear collection removes all inactive artists', async () => {
    const emptyArchive = {
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [],
    };
    const archiveWithInactive = {
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 2,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Artist One'), inactiveArtist('a2', 'Artist Two')],
    };

    getMyArchiveMock.mockResolvedValueOnce(archiveWithInactive).mockResolvedValue(emptyArchive);
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear collection' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear collection' }));

    await waitFor(() => {
      expect(removeArtistFromArchiveApiMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    });
  });

  test('select mode only applies to inactive artists', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 3,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Active Artist'), inactiveArtist('a2', 'Inactive Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    const selectableRows = document.querySelectorAll('.collection__artist-row-wrap--selectable');
    expect(selectableRows.length).toBe(1);
    expect(selectableRows[0]?.textContent).toContain('Inactive Artist');
  });

  test('done exits select mode', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

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
    const emptyArchive = {
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [],
    };

    getMyArchiveMock.mockResolvedValueOnce({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Inactive Artist')],
    });
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Artist removed from collection')).toBeTruthy();
    });
  });

  test('shows collection cleared toast after clear collection', async () => {
    const emptyArchive = {
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [],
    };

    getMyArchiveMock
      .mockResolvedValueOnce({
        isPremium: true,
        slotsUsed: 0,
        slotsLimit: 3,
        inactiveCount: 1,
        subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
        artists: [inactiveArtist('a1', 'Inactive Artist')],
      })
      .mockResolvedValue(emptyArchive);
    removeArtistFromArchiveApiMock.mockResolvedValue({ archive: emptyArchive });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear collection' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear collection' }));

    await waitFor(() => {
      expect(screen.getByText('Collection cleared')).toBeTruthy();
    });
  });

  test('renders minimalist artist cards with delete action', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [activeArtist('a1', 'Active Artist')],
    });

    const { container } = renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Active Artist')).toBeTruthy();
    });

    expect(container.querySelector('.user-dashboard__section')).toBeTruthy();
    expect(container.querySelector('.user-dashboard__albums-list')).toBeTruthy();
    expect(container.querySelector('.collection__summary-card.dashboard-card')).toBeTruthy();
    expect(container.querySelector('.collection__list-card.dashboard-card')).toBeTruthy();
    expect(container.querySelector('.collection__artist-row')).toBeTruthy();
    expect(container.querySelector('.collection__artist-row .status-badge')).toBeNull();
    expect(container.querySelector('.dashboard-button--destructive')).toBeTruthy();
  });

  test('select mode shows bottom action bar', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
      subscriptionExpiresAt: '2026-08-03T12:00:00.000Z',
      artists: [inactiveArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate (0)' })).toBeTruthy();
  });
});
