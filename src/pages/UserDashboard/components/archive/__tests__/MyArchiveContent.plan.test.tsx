/**
 * UI tests for plan display in MyArchiveContent slots header.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { MyArchiveContent } from '../MyArchiveContent';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  removeArtistFromArchiveApi: jest.fn(),
  ArchiveApiError: class ArchiveApiError extends Error {},
}));

describe('MyArchiveContent plan display', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
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
  });
});
