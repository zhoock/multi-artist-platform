/**
 * Unit tests for per-artist archive lock helpers and add/remove enforcement.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
  isSubscriptionActive: jest.fn(),
}));

import { query } from '../db';
import { getViewerSubscription, isSubscriptionActive } from '../subscriptions';
import {
  addArtistToArchive,
  ArchiveArtistLockedError,
  ArchiveSubscriptionRequiredError,
  canRemoveArchiveArtist,
  isArchiveArtistLocked,
  removeArtistFromArchive,
} from '../archive';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedIsActive = isSubscriptionActive as jest.MockedFunction<typeof isSubscriptionActive>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ARTIST_A = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ARTIST_B = 'cccccccc-dddd-4eee-8fff-000000000000';

const PERIOD_END = new Date('2026-07-20T12:00:00.000Z');
const NOW = new Date('2026-06-20T12:00:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return {
    rows,
    rowCount,
    command: '',
    oid: 0,
    fields: [],
  };
}

function activeSubscription() {
  return {
    id: 'sub-1',
    userId: USER_ID,
    status: 'active' as const,
    plan: 'archive',
    slotsLimit: 3,
    provider: 'yookassa',
    providerSubscriptionId: null,
    startedAt: new Date('2026-05-20T12:00:00.000Z'),
    expiresAt: PERIOD_END,
    createdAt: new Date('2026-05-20T12:00:00.000Z'),
    updatedAt: new Date('2026-05-20T12:00:00.000Z'),
  };
}

function archiveRow(artistUserId: string, lockedUntil: Date | null = PERIOD_END) {
  return {
    id: `row-${artistUserId}`,
    user_id: USER_ID,
    artist_user_id: artistUserId,
    created_at: NOW,
    updated_at: NOW,
    locked_until: lockedUntil,
  };
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedGetSubscription.mockReset();
  mockedIsActive.mockReset();
});

describe('isArchiveArtistLocked', () => {
  test('returns false when locked_until is null', () => {
    expect(isArchiveArtistLocked(null, NOW)).toBe(false);
  });

  test('returns true when locked_until is in the future', () => {
    expect(isArchiveArtistLocked(PERIOD_END, NOW)).toBe(true);
  });

  test('returns false when locked_until is in the past', () => {
    expect(isArchiveArtistLocked(new Date('2026-01-01T00:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('canRemoveArchiveArtist', () => {
  test('requires active subscription', () => {
    expect(canRemoveArchiveArtist(null, false, NOW)).toBe(false);
    expect(canRemoveArchiveArtist(PERIOD_END, false, NOW)).toBe(false);
  });

  test('allows remove when subscription active and lock expired', () => {
    expect(canRemoveArchiveArtist(new Date('2026-01-01T00:00:00.000Z'), true, NOW)).toBe(true);
    expect(canRemoveArchiveArtist(null, true, NOW)).toBe(true);
  });

  test('blocks remove when artist is locked', () => {
    expect(canRemoveArchiveArtist(PERIOD_END, true, NOW)).toBe(false);
  });
});

describe('addArtistToArchive', () => {
  test('sets locked_until to subscription.expires_at on insert', async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT 1 AS one')) {
        return fakeQueryResult([]);
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return fakeQueryResult([{ count: '1' }]);
      }
      if (sql.startsWith('INSERT INTO user_archive')) {
        return fakeQueryResult([archiveRow(ARTIST_A, PERIOD_END)]);
      }
      return fakeQueryResult([]);
    });
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedIsActive.mockReturnValue(true);

    const entry = await addArtistToArchive(USER_ID, ARTIST_A);

    expect(entry.lockedUntil).toEqual(PERIOD_END);
    const insertCall = mockedQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO user_archive')
    );
    expect(insertCall?.[1]).toEqual([USER_ID, ARTIST_A, PERIOD_END]);
  });

  test('does not update locked_until for idempotent add', async () => {
    const existing = archiveRow(ARTIST_A, PERIOD_END);
    mockedQuery.mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT 1 AS one')) {
        return fakeQueryResult([{ one: 1 }]);
      }
      if (sql.startsWith('SELECT id, user_id, artist_user_id')) {
        return fakeQueryResult([existing]);
      }
      return fakeQueryResult([]);
    });

    const entry = await addArtistToArchive(USER_ID, ARTIST_A);

    expect(entry.lockedUntil).toEqual(PERIOD_END);
    expect(
      mockedQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO user_archive'))
    ).toBe(false);
  });
});

describe('removeArtistFromArchive', () => {
  test('throws when subscription is inactive', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedIsActive.mockReturnValue(false);

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).rejects.toBeInstanceOf(
      ArchiveSubscriptionRequiredError
    );
  });

  test('throws when artist is locked', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedIsActive.mockReturnValue(true);
    mockedQuery.mockResolvedValue(fakeQueryResult([archiveRow(ARTIST_A, PERIOD_END)]));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).rejects.toBeInstanceOf(
      ArchiveArtistLockedError
    );
  });

  test('allows remove when lock expired', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedIsActive.mockReturnValue(true);
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([archiveRow(ARTIST_A, new Date('2026-01-01T00:00:00.000Z'))])
      )
      .mockResolvedValueOnce(fakeQueryResult([], 1));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).resolves.toBe(true);
  });

  test('returns false when artist not in archive', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedIsActive.mockReturnValue(true);
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_B)).resolves.toBe(false);
  });
});
