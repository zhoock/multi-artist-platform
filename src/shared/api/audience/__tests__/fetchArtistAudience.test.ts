import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const fetchWithAuthSessionMock =
  jest.fn<(input: string, init?: RequestInit) => Promise<Response>>();
const getAuthHeaderMock = jest.fn<() => { Authorization: string } | Record<string, never>>();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (input: string, init?: RequestInit) =>
    fetchWithAuthSessionMock(input, init),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => getAuthHeaderMock(),
}));

import { fetchArtistAudience } from '../index';

describe('fetchArtistAudience', () => {
  beforeEach(() => {
    fetchWithAuthSessionMock.mockReset();
    getAuthHeaderMock.mockReset();
    getAuthHeaderMock.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  it('sends Authorization header with the audience request', async () => {
    fetchWithAuthSessionMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          period: '30d',
          listeners: 1,
          plays: 1,
          regularListeners: 0,
          collectionCount: 1,
          listenersTimeline: [],
          topTracks: [],
          supporters: [],
          supportersTotal: 0,
          revenue: {
            currency: 'RUB',
            albumSales: 0,
            subscriberSupport: 0,
            total: 0,
          },
        },
      }),
    } as Response);

    await fetchArtistAudience({ period: '30d' });

    expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
      '/api/artist-audience?period=30d',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
});
