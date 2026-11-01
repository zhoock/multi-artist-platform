/**
 * Per-user qualified play rate limit tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { checkQualifiedPlayUserRateLimit } from '../qualified-play-rate-limit';

const mockedQuery = query as jest.MockedFunction<typeof query>;

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}

beforeEach(() => {
  mockedQuery.mockReset();
});

describe('checkQualifiedPlayUserRateLimit', () => {
  test('allows requests under hourly limit', async () => {
    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([{ request_count: 1, window_hour: new Date() }])
    );
    await expect(checkQualifiedPlayUserRateLimit('user-1')).resolves.toEqual({ allowed: true });
  });

  test('blocks when hourly limit exceeded', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));
    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([{ window_hour: new Date(Date.now() - 1000) }])
    );
    const result = await checkQualifiedPlayUserRateLimit('user-1');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
