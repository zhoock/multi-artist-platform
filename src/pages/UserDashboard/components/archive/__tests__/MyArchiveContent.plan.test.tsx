/**
 * UI tests for plan display and contextual plan actions in MyArchiveContent.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { MyArchiveContent } from '../MyArchiveContent';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const openSupportModalMock = jest.fn();

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
    openSupportModalMock.mockReset();
  });

  test('shows plan-change banner when inactive artists remain after downgrade', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 2,
      artists: [inactiveArtist('a1', 'Artist One'), inactiveArtist('a2', 'Artist Two')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Explorer')).toBeTruthy();
    });

    expect(screen.getByText('0 / 1')).toBeTruthy();
    expect(screen.getByText(/Previously supported artists are now inactive/i)).toBeTruthy();
    expect(screen.getByText('2 inactive artists')).toBeTruthy();
    expect(screen.queryByText('Collection Full')).toBeNull();
  });

  test('shows collection full when active slots are full even with inactive artists', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 1,
      artists: [activeArtist('a1', 'Active Artist'), inactiveArtist('a2', 'Inactive Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upgrade Plan' })).toBeTruthy();
    });

    expect(screen.getByText('Collection Full')).toBeTruthy();
    expect(screen.getByText("You've used all 1 collection slot.")).toBeTruthy();
    expect(screen.getByText('1 inactive artists')).toBeTruthy();
    expect(screen.queryByText(/Previously supported artists are now inactive/i)).toBeNull();
  });

  test('hides plan badge when user has no subscription history', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
      inactiveCount: 0,
      artists: [],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('0 / 3')).toBeTruthy();
    });

    expect(screen.queryByText('Archivist')).toBeNull();
    expect(screen.queryByText('Explorer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renew Support' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();
  });

  test('shows upgrade plan card when collection is full and support is active', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upgrade Plan' })).toBeTruthy();
    });

    expect(screen.getByText('Collection Full')).toBeTruthy();
    expect(screen.getByText("You've used all 1 collection slot.")).toBeTruthy();
    expect(screen.getByText('Upgrade your plan to support more artists.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renew Support' })).toBeNull();

    const banner = document.querySelector('.user-dashboard__archive-full-banner');
    const firstArtistCard = document.querySelector('.user-dashboard__archive-card');
    expect(banner).toBeInstanceOf(Element);
    expect(firstArtistCard).toBeInstanceOf(Element);
    if (!(banner instanceof Element) || !(firstArtistCard instanceof Element)) {
      throw new Error('Expected collection full banner and artist card in the DOM');
    }
    expect(
      banner.compareDocumentPosition(firstArtistCard) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Plan' }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows renew support card when support is inactive and user had a plan', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
      artists: [inactiveArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renew Support' })).toBeTruthy();
    });

    expect(screen.getAllByText('Support inactive').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Renew Support' }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows no plan actions when support is active and slots remain', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 2,
      inactiveCount: 0,
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renew Support' })).toBeNull();
    expect(screen.getByText(/slot available/i)).toBeTruthy();
  });

  test('always shows remove button for active unlocked artist', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      artists: [activeArtist('a1', 'Active Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Can be removed')).toBeTruthy();
    });

    expect(screen.getByText('You can remove this artist at any time.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('shows disabled remove button for locked active artist', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 1,
      inactiveCount: 0,
      artists: [
        activeArtist('a1', 'Locked Artist', {
          isLocked: true,
          lockedUntil: '2026-07-20T12:00:00.000Z',
        }),
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText(/Locked until/i)).toBeTruthy();
    });

    expect(screen.getByText("You can't remove this artist until the lock expires.")).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove\b/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove\b/i })).toBeDisabled();
  });

  test('shows enabled remove button for inactive artist', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
      artists: [inactiveArtist('a1', 'Inactive Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Support inactive')).toBeTruthy();
    });

    expect(screen.getByText('This artist no longer uses an active slot.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  test('opens plan modal when slots card is clicked', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 2,
      slotsLimit: 3,
      inactiveCount: 0,
      artists: [activeArtist('a1', 'Artist')],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Manage Plan →')).toBeTruthy();
    });

    fireEvent.click(document.querySelector('.user-dashboard__archive-slots-card')!);
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('select mode shows bottom action bar', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 1,
      inactiveCount: 1,
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
