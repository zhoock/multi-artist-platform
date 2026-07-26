import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ArchiveStatus } from '@shared/api/archive';

const ARTIST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockGetArchiveStatus = jest.fn<() => Promise<ArchiveStatus>>();
const mockActivateArchiveArtistsApi =
  jest.fn<() => Promise<{ archive: unknown; activatedCount: number }>>();

jest.mock('@shared/api/archive', () => ({
  activateArchiveArtistsApi: (...args: unknown[]) => mockActivateArchiveArtistsApi(...args),
  addArtistToArchiveApi: jest.fn(),
  getArchiveStatus: (...args: unknown[]) => mockGetArchiveStatus(...args),
  ArchiveApiError: class ArchiveApiError extends Error {},
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'token',
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => ({ id: 'viewer-id' }),
}));

import { useArtistArchiveStatus } from '../useArtistArchiveStatus';

function inactiveStatus(): ArchiveStatus {
  return {
    isPremium: true,
    artistInArchive: true,
    artistActiveInArchive: false,
    slotsUsed: 2,
    slotsLimit: 3,
  };
}

function activeStatus(): ArchiveStatus {
  return {
    isPremium: true,
    artistInArchive: true,
    artistActiveInArchive: true,
    slotsUsed: 2,
    slotsLimit: 3,
  };
}

describe('useArtistArchiveStatus activation', () => {
  beforeEach(() => {
    mockGetArchiveStatus.mockReset();
    mockActivateArchiveArtistsApi.mockReset();
    mockGetArchiveStatus.mockResolvedValue(inactiveStatus());
    mockActivateArchiveArtistsApi.mockResolvedValue({ archive: {}, activatedCount: 1 });
  });

  test('shows local activating state then switches CTA to in_collection_active', async () => {
    mockGetArchiveStatus
      .mockResolvedValueOnce(inactiveStatus())
      .mockResolvedValueOnce(activeStatus());

    const { result } = renderHook(() => useArtistArchiveStatus(ARTIST_ID));

    await waitFor(() => {
      expect(result.current.buttonState).toBe('in_collection_inactive');
    });

    let activatePromise: Promise<ArchiveStatus | null> | undefined;
    act(() => {
      activatePromise = result.current.activateInArchive();
    });

    expect(result.current.buttonState).toBe('activating');
    expect(result.current.activating).toBe(true);

    await act(async () => {
      await activatePromise;
    });

    expect(result.current.buttonState).toBe('in_collection_active');
    expect(result.current.activating).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(mockActivateArchiveArtistsApi).toHaveBeenCalledWith([ARTIST_ID]);
  });

  test('does not refetch archive status again after self-dispatched archive:changed', async () => {
    mockGetArchiveStatus
      .mockResolvedValueOnce(inactiveStatus())
      .mockResolvedValueOnce(activeStatus());

    const { result } = renderHook(() => useArtistArchiveStatus(ARTIST_ID));

    await waitFor(() => {
      expect(result.current.buttonState).toBe('in_collection_inactive');
    });

    const callsBeforeActivate = mockGetArchiveStatus.mock.calls.length;

    await act(async () => {
      await result.current.activateInArchive();
    });

    expect(mockGetArchiveStatus.mock.calls.length).toBe(callsBeforeActivate + 1);
    expect(result.current.loading).toBe(false);
  });
});
