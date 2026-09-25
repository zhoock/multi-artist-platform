import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  ensurePublicArtistsLoaded,
  invalidatePublicArtistsCache,
  prefetchPublicArtists,
} from '../publicArtistsCache';

const mockArtists = [
  {
    name: 'Test Artist',
    publicSlug: 'test-artist',
    genreCode: 'other',
    monetizationEnabled: true,
  },
];

function mockPublicArtistsResponse() {
  jest.mocked(fetchWithAuthSession).mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: mockArtists }),
  } as Response);
}

describe('publicArtistsCache — inflight dedupe', () => {
  beforeEach(() => {
    invalidatePublicArtistsCache();
    jest.clearAllMocks();
  });

  test('prefetch + ensurePublicArtistsLoaded выполняют один HTTP запрос', async () => {
    mockPublicArtistsResponse();

    prefetchPublicArtists();
    await ensurePublicArtistsLoaded();

    const publicArtistCalls = jest
      .mocked(fetchWithAuthSession)
      .mock.calls.filter(([url]) => String(url).includes('/api/public-artists'));
    expect(publicArtistCalls).toHaveLength(1);
  });

  test('повторный ensurePublicArtistsLoaded после успеха не дергает сеть', async () => {
    mockPublicArtistsResponse();

    await ensurePublicArtistsLoaded();
    await ensurePublicArtistsLoaded();

    const publicArtistCalls = jest
      .mocked(fetchWithAuthSession)
      .mock.calls.filter(([url]) => String(url).includes('/api/public-artists'));
    expect(publicArtistCalls).toHaveLength(1);
  });
});
