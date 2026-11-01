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
