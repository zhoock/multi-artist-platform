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

describe('MyArchiveContent plan display', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
    openSupportModalMock.mockReset();
  });

  test('shows plan badge and overage hint', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 3,
      slotsLimit: 2,
      artists: [],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('Collector')).toBeTruthy();
    });

    expect(screen.getByText('3 / 2')).toBeTruthy();
    expect(screen.getByText('Collection exceeds current plan limit')).toBeTruthy();
  });

  test('hides plan badge when user has no subscription history', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 0,
      slotsLimit: 3,
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
      artists: [
        {
          id: '1',
          artistUserId: 'a1',
          name: 'Artist',
          slug: 'artist',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          cover: null,
          addedAt: '2026-01-01',
          isLocked: false,
          lockedUntil: null,
        },
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upgrade Plan' })).toBeTruthy();
    });

    expect(screen.getByText('Collection Full')).toBeTruthy();
    expect(
      screen.getByText(
        'You have used all collection slots. Upgrade your plan to support more artists.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renew Support' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Plan' }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows renew support card when support is inactive and user had a plan', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: false,
      slotsUsed: 1,
      slotsLimit: 1,
      artists: [
        {
          id: '1',
          artistUserId: 'a1',
          name: 'Artist',
          slug: 'artist',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          cover: null,
          addedAt: '2026-01-01',
          isLocked: false,
          lockedUntil: null,
        },
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renew Support' })).toBeTruthy();
    });

    expect(screen.getByText('Support inactive')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Renew Support' }));
    expect(openSupportModalMock).toHaveBeenCalledTimes(1);
  });

  test('shows no plan actions when support is active and slots remain', async () => {
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 1,
      slotsLimit: 2,
      artists: [
        {
          id: '1',
          artistUserId: 'a1',
          name: 'Artist',
          slug: 'artist',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          cover: null,
          addedAt: '2026-01-01',
          isLocked: false,
          lockedUntil: null,
        },
      ],
    });

    renderWithProviders(<MyArchiveContent active />);

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Upgrade Plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renew Support' })).toBeNull();
    expect(screen.getByText(/slot available/i)).toBeTruthy();
  });
});
