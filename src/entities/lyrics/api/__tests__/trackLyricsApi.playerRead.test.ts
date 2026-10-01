import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const fetchWithAuthSession = jest.fn() as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>
>;

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (input: string, init?: RequestInit) => fetchWithAuthSession(input, init),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => ({}),
}));

jest.mock('@shared/lib/publicArtistContext', () => ({
  resolvePublicArtistSlugForApi: jest.fn(async () => 'the-artist'),
  shouldSkipUnauthenticatedPublicArtistApi: jest.fn(async () => false),
}));

import {
  TrackLyricsUnavailableError,
  fetchTrackLyricsBundle,
} from '@entities/lyrics/api/trackLyricsApi';

describe('fetchTrackLyricsBundle player read', () => {
  beforeEach(() => {
    fetchWithAuthSession.mockReset();
  });

  test('404 becomes an empty bundle', async () => {
    fetchWithAuthSession.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'Track lyrics not found' }),
    });

    const bundle = await fetchTrackLyricsBundle('album-1', 'track-1', 'ru', {
      tolerateMissing: true,
    });

    expect(bundle.state).toBe('empty');
  });

  test('success without data is not stored as empty lyrics', async () => {
    fetchWithAuthSession.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      fetchTrackLyricsBundle('album-1', 'track-1', 'ru', { tolerateMissing: true })
    ).rejects.toBeInstanceOf(TrackLyricsUnavailableError);
  });
});
