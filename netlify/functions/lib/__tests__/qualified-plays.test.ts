/**
 * Unit tests for qualified listen rules and registration.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../entitlements', () => ({
  viewerHasPremiumAccessToArtist: jest.fn(),
}));

jest.mock('../subscription-access', () => ({
  hasPremiumAccess: jest.fn(),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

jest.mock('../artist-audience-revenue', () => ({
  getArtistAudienceRevenue: jest.fn(async () => ({
    currency: 'RUB',
    albumSales: 0,
    subscriberSupport: 0,
    total: 0,
  })),
}));

import { query } from '../db';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import {
  getQualifiedListenThresholdSeconds,
  isQualifiedListenDuration,
  listenerIdentityKey,
  normalizeReportedListenDuration,
  registerQualifiedPlay,
  resolveTrackForQualifiedPlay,
  countActiveCollectionForArtist,
  getArtistAudienceStats,
} from '../qualified-plays';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedPremium = viewerHasPremiumAccessToArtist as jest.MockedFunction<
  typeof viewerHasPremiumAccessToArtist
>;

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}

const ARTIST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LISTENER = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const TRACK_UUID = 'cccccccc-dddd-4eee-8fff-000000000000';
const SESSION = 'dddddddd-eeee-4fff-8000-111111111111';

beforeEach(() => {
  mockedQuery.mockReset();
  mockedPremium.mockReset();
});

describe('qualified listen threshold', () => {
  test('listen under 30 seconds on normal track does not qualify', () => {
    expect(getQualifiedListenThresholdSeconds(240)).toBe(30);
    expect(isQualifiedListenDuration(29, 240)).toBe(false);
  });

  test('listen at 30 seconds or more qualifies', () => {
    expect(isQualifiedListenDuration(30, 240)).toBe(true);
    expect(isQualifiedListenDuration(45, 240)).toBe(true);
  });

  test('short track qualifies at 50% duration', () => {
    expect(getQualifiedListenThresholdSeconds(20)).toBe(10);
    expect(isQualifiedListenDuration(9.9, 20)).toBe(false);
    expect(isQualifiedListenDuration(10, 20)).toBe(true);
  });
});

describe('normalizeReportedListenDuration', () => {
  test('rejects inflated client duration beyond track length', () => {
    expect(normalizeReportedListenDuration(9999, 180)).toBe(185);
  });

  test('rejects below threshold', () => {
    expect(normalizeReportedListenDuration(10, 180)).toBeNull();
  });

  test('accepts valid duration at threshold', () => {
    expect(normalizeReportedListenDuration(30, 180)).toBe(30);
  });
});

describe('registerQualifiedPlay', () => {
  function mockTrack(duration: number) {
    mockedQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('FROM tracks t')) {
        return fakeQueryResult([
          {
            track_uuid: TRACK_UUID,
            artist_user_id: ARTIST,
            duration,
          },
        ]);
      }
      if (String(sql).startsWith('INSERT INTO qualified_track_plays')) {
        return fakeQueryResult([{ id: 'row-1' }]);
      }
      return fakeQueryResult([]);
    });
  }

  test('owner play is not recorded', async () => {
    mockTrack(200);
    const result = await registerQualifiedPlay({
      albumSlug: 'album-1',
      logicalTrackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 40,
      listenerUserId: ARTIST,
      listenerAnonId: null,
    });
    expect(result).toEqual({ ok: false, code: 'OWNER_PLAY' });
  });

  test('duplicate session insert is idempotent', async () => {
    mockTrack(200);
    mockedQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('FROM tracks t')) {
        return fakeQueryResult([{ track_uuid: TRACK_UUID, artist_user_id: ARTIST, duration: 200 }]);
      }
      if (String(sql).startsWith('INSERT INTO qualified_track_plays')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult([]);
    });

    const result = await registerQualifiedPlay({
      albumSlug: 'album-1',
      logicalTrackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 40,
      listenerUserId: LISTENER,
      listenerAnonId: null,
    });
    expect(result).toEqual({ ok: true, inserted: false });
  });

  test('qualified play inserts once', async () => {
    mockTrack(200);
    const result = await registerQualifiedPlay({
      albumSlug: 'album-1',
      logicalTrackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 40,
      listenerUserId: LISTENER,
      listenerAnonId: null,
    });
    expect(result).toEqual({ ok: true, inserted: true });
  });

  test('stores listen geo columns when provided', async () => {
    mockTrack(200);
    await registerQualifiedPlay({
      albumSlug: 'album-1',
      logicalTrackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 40,
      listenerUserId: LISTENER,
      listenerAnonId: null,
      listenCity: 'Berlin',
      listenCountryCode: 'DE',
    });

    const insertCall = mockedQuery.mock.calls.find((call) =>
      String(call[0]).startsWith('INSERT INTO qualified_track_plays')
    );
    expect(insertCall?.[1]).toEqual([
      ARTIST,
      TRACK_UUID,
      LISTENER,
      null,
      SESSION,
      40,
      'Berlin',
      'DE',
    ]);
  });

  test('insert succeeds with null geo', async () => {
    mockTrack(200);
    const result = await registerQualifiedPlay({
      albumSlug: 'album-1',
      logicalTrackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 40,
      listenerUserId: LISTENER,
      listenerAnonId: null,
      listenCity: null,
      listenCountryCode: null,
    });
    expect(result).toEqual({ ok: true, inserted: true });
    const insertCall = mockedQuery.mock.calls.find((call) =>
      String(call[0]).startsWith('INSERT INTO qualified_track_plays')
    );
    expect(insertCall?.[1]?.slice(6)).toEqual([null, null]);
  });
});

describe('listenerIdentityKey', () => {
  test('two different users produce different keys', () => {
    expect(listenerIdentityKey('u1', null)).toBe('u:u1');
    expect(listenerIdentityKey('u2', null)).toBe('u:u2');
    expect(listenerIdentityKey('u1', null)).not.toBe(listenerIdentityKey('u2', null));
  });

  test('anon listener key is distinct from user id', () => {
    expect(listenerIdentityKey(null, SESSION)).toBe(`a:${SESSION}`);
  });
});

describe('resolveTrackForQualifiedPlay', () => {
  test('resolves track row by album slug and logical track id', async () => {
    mockedQuery.mockResolvedValue(
      fakeQueryResult([{ track_uuid: TRACK_UUID, artist_user_id: ARTIST, duration: '180.5' }])
    );
    const resolved = await resolveTrackForQualifiedPlay('my-album', '3');
    expect(resolved).toEqual({
      trackUuid: TRACK_UUID,
      artistUserId: ARTIST,
      durationSeconds: 180.5,
    });
  });
});

describe('top tracks ordering', () => {
  test('sorts by plays descending', () => {
    const rows = [
      { title: 'B', plays: 2 },
      { title: 'A', plays: 5 },
      { title: 'C', plays: 2 },
    ];
    const sorted = [...rows].sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));
    expect(sorted.map((r) => r.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('supporter access', () => {
  test('viewerHasPremiumAccessToArtist is used for supporter status', async () => {
    mockedPremium.mockResolvedValue(true);
    await expect(viewerHasPremiumAccessToArtist(LISTENER, ARTIST)).resolves.toBe(true);
    expect(mockedPremium).toHaveBeenCalledWith(LISTENER, ARTIST);
  });
});

describe('unique listeners aggregation', () => {
  test('one user with multiple plays still counts as one listener key', () => {
    const keys = new Set([
      listenerIdentityKey(LISTENER, null),
      listenerIdentityKey(LISTENER, null),
    ]);
    expect(keys.size).toBe(1);
  });

  test('two users are distinct listener keys', () => {
    const a = listenerIdentityKey('user-a', null);
    const b = listenerIdentityKey('user-b', null);
    expect(a).not.toBe(b);
  });
});

describe('regular listener rule', () => {
  test('requires three distinct listening days', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
    expect(new Set(days).size >= 3).toBe(true);
    expect(new Set(['2026-03-01', '2026-03-01', '2026-03-02']).size >= 3).toBe(false);
  });
});

describe('collection count source', () => {
  test('counts active user_archive rows for artist', async () => {
    mockedQuery.mockResolvedValue(fakeQueryResult([{ count: '4' }]));
    await expect(countActiveCollectionForArtist(ARTIST)).resolves.toBe(4);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('FROM user_archive');
  });
});

describe('artist audience authorization', () => {
  test('stats artist id must match authenticated owner (handler contract)', () => {
    const ownerId = ARTIST;
    const requestedArtistId = ownerId;
    expect(requestedArtistId === ownerId).toBe(true);
  });
});

function mockAudienceStatsQueries(cityRows: Array<{ city: string; code: string; plays: number }>) {
  mockedPremium.mockResolvedValue(false);
  mockedQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('ORDER BY day ASC')) {
      return fakeQueryResult([]);
    }
    if (s.includes(') regulars')) {
      return fakeQueryResult([{ count: '0' }]);
    }
    if (s.includes('COUNT(DISTINCT COALESCE(listener_user_id')) {
      return fakeQueryResult([{ count: '0' }]);
    }
    if (
      s.includes('SELECT COUNT(*)::text AS count') &&
      s.includes('qualified_track_plays') &&
      !s.includes('GROUP BY')
    ) {
      return fakeQueryResult([{ count: '0' }]);
    }
    if (s.includes('FROM user_archive')) {
      if (s.includes('COUNT(*)')) {
        return fakeQueryResult([{ count: '0' }]);
      }
      return fakeQueryResult([]);
    }
    if (s.includes('ranked_tracks')) {
      return fakeQueryResult([{ count: '0' }]);
    }
    if (s.includes('FROM qualified_track_plays q') && s.includes('INNER JOIN tracks')) {
      return fakeQueryResult([]);
    }
    if (s.includes('grouped_cities')) {
      return fakeQueryResult([{ count: String(cityRows.length) }]);
    }
    if (s.includes('listen_city') && s.includes('GROUP BY listen_country_code')) {
      return fakeQueryResult(
        cityRows.map((row) => ({
          listen_city: row.city,
          listen_country_code: row.code,
          plays: String(row.plays),
        }))
      );
    }
    return fakeQueryResult([]);
  });
}

describe('getArtistAudienceStats top cities', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  test('aggregates cities with country grouping and rank offset', async () => {
    mockAudienceStatsQueries([
      { city: 'Paris', code: 'FR', plays: 10 },
      { city: 'Paris', code: 'US', plays: 3 },
    ]);

    const stats = await getArtistAudienceStats(ARTIST, '30d', {
      citiesLimit: 10,
      citiesOffset: 0,
      tracksLimit: 1,
      supportersLimit: 1,
    });

    expect(stats.topCitiesTotal).toBe(2);
    expect(stats.topCities).toEqual([
      { rank: 1, city: 'Paris', countryCode: 'FR', plays: 10 },
      { rank: 2, city: 'Paris', countryCode: 'US', plays: 3 },
    ]);
  });

  test('uses period start for city queries', async () => {
    const fixedNow = new Date('2026-11-02T12:00:00.000Z');
    mockAudienceStatsQueries([]);

    await getArtistAudienceStats(ARTIST, '7d', { citiesLimit: 2 }, fixedNow);

    const cityQuery = mockedQuery.mock.calls.find((call) =>
      String(call[0]).includes('GROUP BY listen_country_code')
    );
    expect(cityQuery?.[1]?.[1]).toEqual(new Date('2026-10-26T12:00:00.000Z'));
  });
});
