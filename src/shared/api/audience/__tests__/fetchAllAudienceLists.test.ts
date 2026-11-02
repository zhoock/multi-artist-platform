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

import {
  AUDIENCE_CITIES_PAGE_MAX,
  AUDIENCE_TRACKS_PAGE_MAX,
  fetchAllAudienceCities,
  fetchAllAudienceTopTracks,
  type AudienceListenCity,
  type AudienceTopTrack,
} from '../index';

describe('fetchAllAudienceTopTracks', () => {
  beforeEach(() => {
    fetchWithAuthSessionMock.mockReset();
    getAuthHeaderMock.mockReset();
    getAuthHeaderMock.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  it('loads every page until topTracksTotal is reached', async () => {
    const page1: AudienceTopTrack[] = Array.from({ length: AUDIENCE_TRACKS_PAGE_MAX }, (_, i) => ({
      rank: i + 1,
      trackId: `t-${i}`,
      title: `Track ${i}`,
      plays: 1,
      albumCover: null,
      albumUserId: null,
    }));
    const page2: AudienceTopTrack[] = [
      {
        rank: AUDIENCE_TRACKS_PAGE_MAX + 1,
        trackId: 't-last',
        title: 'Last',
        plays: 2,
        albumCover: null,
        albumUserId: null,
      },
    ];

    fetchWithAuthSessionMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            period: '30d',
            topTracks: page1,
            topTracksTotal: AUDIENCE_TRACKS_PAGE_MAX + 1,
            topCities: [],
            topCitiesTotal: 0,
            supporters: [],
            supportersTotal: 0,
            listeners: 0,
            plays: 0,
            regularListeners: 0,
            collectionCount: 0,
            listenersTimeline: [],
            revenue: { currency: 'RUB', albumSales: 0, subscriberSupport: 0, total: 0 },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            period: '30d',
            topTracks: page2,
            topTracksTotal: AUDIENCE_TRACKS_PAGE_MAX + 1,
            supporters: [],
            supportersTotal: 0,
            listeners: 0,
            plays: 0,
            regularListeners: 0,
            collectionCount: 0,
            listenersTimeline: [],
            revenue: { currency: 'RUB', albumSales: 0, subscriberSupport: 0, total: 0 },
          },
        }),
      } as Response);

    const tracks = await fetchAllAudienceTopTracks('30d');

    expect(tracks).toHaveLength(AUDIENCE_TRACKS_PAGE_MAX + 1);
    expect(fetchWithAuthSessionMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchAllAudienceCities', () => {
  beforeEach(() => {
    fetchWithAuthSessionMock.mockReset();
    getAuthHeaderMock.mockReset();
    getAuthHeaderMock.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  it('loads every page until topCitiesTotal is reached', async () => {
    const page1: AudienceListenCity[] = Array.from(
      { length: AUDIENCE_CITIES_PAGE_MAX },
      (_, i) => ({
        rank: i + 1,
        city: `City ${i}`,
        countryCode: 'US',
        plays: 1,
      })
    );
    const page2: AudienceListenCity[] = [
      {
        rank: AUDIENCE_CITIES_PAGE_MAX + 1,
        city: 'Last City',
        countryCode: 'DE',
        plays: 2,
      },
    ];

    fetchWithAuthSessionMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            period: '30d',
            topCities: page1,
            topCitiesTotal: AUDIENCE_CITIES_PAGE_MAX + 1,
            topTracks: [],
            topTracksTotal: 0,
            supporters: [],
            supportersTotal: 0,
            listeners: 0,
            plays: 0,
            regularListeners: 0,
            collectionCount: 0,
            listenersTimeline: [],
            revenue: { currency: 'RUB', albumSales: 0, subscriberSupport: 0, total: 0 },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            period: '30d',
            topCities: page2,
            topCitiesTotal: AUDIENCE_CITIES_PAGE_MAX + 1,
            topTracks: [],
            topTracksTotal: 0,
            supporters: [],
            supportersTotal: 0,
            listeners: 0,
            plays: 0,
            regularListeners: 0,
            collectionCount: 0,
            listenersTimeline: [],
            revenue: { currency: 'RUB', albumSales: 0, subscriberSupport: 0, total: 0 },
          },
        }),
      } as Response);

    const cities = await fetchAllAudienceCities('30d');

    expect(cities).toHaveLength(AUDIENCE_CITIES_PAGE_MAX + 1);
    expect(fetchWithAuthSessionMock).toHaveBeenCalledTimes(2);
  });
});
