/**
 * Unit tests for per-artist archive lock and activation helpers.
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-access', () => ({
  hasPremiumAccess: jest.fn(),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

import { query } from '../db';
import { hasPremiumAccess } from '../subscription-access';
import { getViewerSubscription } from '../subscriptions';
import {
  activateArtistsInArchive,
  addArtistToArchive,
  ArchiveArtistLockedError,
  ArchiveSubscriptionRequiredError,
  canRemoveArchiveArtist,
  deactivateAllArchiveArtists,
  deactivateExcessArchiveArtists,
  extendActiveArchiveLockedUntil,
  isArchiveArtistLocked,
  removeArtistFromArchive,
  userHasActiveArtistInArchive,
} from '../archive';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedHasPremiumAccess = hasPremiumAccess as jest.MockedFunction<typeof hasPremiumAccess>;

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

function activeSubscription(slotsLimit = 1) {
  return {
    id: 'sub-1',
    userId: USER_ID,
    status: 'active' as const,
    plan: 'explorer',
    slotsLimit,
    provider: 'yookassa',
    providerSubscriptionId: null,
    startedAt: new Date('2026-05-20T12:00:00.000Z'),
    expiresAt: PERIOD_END,
    createdAt: new Date('2026-05-20T12:00:00.000Z'),
    updatedAt: new Date('2026-05-20T12:00:00.000Z'),
  };
}

function archiveRow(isActive: boolean, lockedUntil: Date | null = PERIOD_END) {
  return {
    id: 'row-1',
    user_id: USER_ID,
    artist_user_id: ARTIST_A,
    created_at: NOW,
    updated_at: NOW,
    is_active: isActive,
    locked_until: lockedUntil,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockedQuery.mockReset();
  mockedGetSubscription.mockReset();
  mockedHasPremiumAccess.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
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
  test('allows removing inactive artists without subscription', () => {
    expect(canRemoveArchiveArtist(PERIOD_END, false, false, NOW)).toBe(true);
  });

  test('requires subscription to remove active artists', () => {
    expect(canRemoveArchiveArtist(null, false, true, NOW)).toBe(false);
    expect(canRemoveArchiveArtist(PERIOD_END, false, true, NOW)).toBe(false);
  });

  test('allows remove when subscription active and lock expired', () => {
    expect(canRemoveArchiveArtist(new Date('2026-01-01T00:00:00.000Z'), true, true, NOW)).toBe(
      true
    );
    expect(canRemoveArchiveArtist(null, true, true, NOW)).toBe(true);
  });

  test('blocks remove when artist is locked', () => {
    expect(canRemoveArchiveArtist(PERIOD_END, true, true, NOW)).toBe(false);
  });
});

describe('deactivateAllArchiveArtists', () => {
  test('deactivates active rows', async () => {
    mockedQuery.mockResolvedValue(fakeQueryResult([], 2));
    await expect(deactivateAllArchiveArtists(USER_ID)).resolves.toBe(2);
  });
});

describe('deactivateExcessArchiveArtists', () => {
  test('deactivates rows above slotsLimit with deterministic order', async () => {
    mockedQuery.mockResolvedValue(fakeQueryResult([], 1));
    await expect(deactivateExcessArchiveArtists(USER_ID, 1)).resolves.toBe(1);

    const sql = String(mockedQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('locked_until DESC NULLS LAST');
    expect(sql).toContain('created_at DESC');
    expect(sql).toContain('rn > $2');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([USER_ID, 1]);
  });

  test('returns 0 for negative slotsLimit without query', async () => {
    await expect(deactivateExcessArchiveArtists(USER_ID, -1)).resolves.toBe(0);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe('extendActiveArchiveLockedUntil', () => {
  test('updates active rows only', async () => {
    mockedQuery.mockResolvedValue(fakeQueryResult([], 2));
    await expect(extendActiveArchiveLockedUntil(USER_ID, PERIOD_END)).resolves.toBe(2);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('is_active = true');
  });
});

describe('activateArtistsInArchive', () => {
  test('activates inactive artists and sets locked_until', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription(1));
    mockedHasPremiumAccess.mockReturnValue(true);
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(fakeQueryResult([], 1));

    await expect(activateArtistsInArchive(USER_ID, [ARTIST_A])).resolves.toBe(1);

    const updateCall = mockedQuery.mock.calls[1];
    expect(String(updateCall?.[0])).toContain('locked_until');
    expect(updateCall?.[1]?.[2]).toEqual(PERIOD_END);
  });
});

describe('addArtistToArchive', () => {
  test('sets locked_until to subscription.expires_at on insert', async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM user_archive') && sql.includes('LIMIT 1')) {
        return fakeQueryResult([]);
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return fakeQueryResult([{ count: '0' }]);
      }
      if (sql.startsWith('INSERT INTO user_archive')) {
        return fakeQueryResult([archiveRow(true, PERIOD_END)]);
      }
      return fakeQueryResult([]);
    });
    mockedGetSubscription.mockResolvedValue(activeSubscription(1));
    mockedHasPremiumAccess.mockReturnValue(true);

    const entry = await addArtistToArchive(USER_ID, ARTIST_A);

    expect(entry.lockedUntil).toEqual(PERIOD_END);
    const insertCall = mockedQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO user_archive')
    );
    expect(insertCall?.[1]).toEqual([USER_ID, ARTIST_A, PERIOD_END]);
  });

  test('reactivates inactive row with new locked_until', async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM user_archive') && sql.includes('LIMIT 1')) {
        return fakeQueryResult([archiveRow(false, null)]);
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return fakeQueryResult([{ count: '0' }]);
      }
      if (sql.startsWith('UPDATE user_archive SET is_active = true')) {
        return fakeQueryResult([archiveRow(true, PERIOD_END)]);
      }
      return fakeQueryResult([]);
    });
    mockedGetSubscription.mockResolvedValue(activeSubscription(1));
    mockedHasPremiumAccess.mockReturnValue(true);

    const entry = await addArtistToArchive(USER_ID, ARTIST_A);
    expect(entry.isActive).toBe(true);
    expect(entry.lockedUntil).toEqual(PERIOD_END);
  });

  test('does not update locked_until for idempotent add of active artist', async () => {
    const existing = archiveRow(true, PERIOD_END);
    mockedQuery.mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM user_archive') && sql.includes('LIMIT 1')) {
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
  test('allows removing inactive artist without subscription', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([archiveRow(false, null)]))
      .mockResolvedValueOnce(fakeQueryResult([], 1));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).resolves.toBe(true);
  });

  test('requires subscription to remove active artist', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedHasPremiumAccess.mockReturnValue(false);
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([archiveRow(true, PERIOD_END)]));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).rejects.toBeInstanceOf(
      ArchiveSubscriptionRequiredError
    );
  });

  test('throws when active artist is locked', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedHasPremiumAccess.mockReturnValue(true);
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([archiveRow(true, PERIOD_END)]));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).rejects.toBeInstanceOf(
      ArchiveArtistLockedError
    );
  });

  test('allows remove when lock expired', async () => {
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedHasPremiumAccess.mockReturnValue(true);
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([archiveRow(true, new Date('2026-01-01T00:00:00.000Z'))])
      )
      .mockResolvedValueOnce(fakeQueryResult([], 1));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_A)).resolves.toBe(true);
  });

  test('returns false when artist not in archive', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    await expect(removeArtistFromArchive(USER_ID, ARTIST_B)).resolves.toBe(false);
  });
});

describe('userHasActiveArtistInArchive', () => {
  test('checks is_active flag', async () => {
    mockedQuery.mockResolvedValue(fakeQueryResult([{ one: 1 }]));
    await expect(userHasActiveArtistInArchive(USER_ID, ARTIST_A)).resolves.toBe(true);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('is_active = true');
  });
});
