/**
 * PR-3c — dispatch lease + generation fencing.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const mockedQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  query: mockedQuery,
  isMissingRelationError: jest.fn(() => false),
}));

import {
  acquireRenewalAttemptDispatchLease,
  attachRenewalProviderPaymentIdWithFence,
  claimRenewalFirstPostAtWithFence,
  createRenewalDispatchRunId,
  releaseRenewalAttemptDispatchLease,
} from '../subscription-renewal-dispatch-lease';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const RUN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedQuery.mockResolvedValue(fakeQueryResult());
});

describe('acquireRenewalAttemptDispatchLease (PR-3c)', () => {
  test('two workers: only one acquire succeeds', async () => {
    let acquireAttempts = 0;
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('dispatch_generation = dispatch_generation + 1')) {
        acquireAttempts += 1;
        if (acquireAttempts === 1) {
          return fakeQueryResult([{ dispatch_generation: 3 }]);
        }
        return fakeQueryResult([]);
      }
      if (sql.includes('SELECT dispatch_phase, status, dispatch_lease_until')) {
        return fakeQueryResult([
          {
            dispatch_phase: 'leased',
            status: 'pending',
            dispatch_lease_until: new Date('2099-01-01T00:00:00.000Z'),
          },
        ]);
      }
      return fakeQueryResult();
    });

    const now = new Date('2026-08-05T12:00:00.000Z');
    const first = await acquireRenewalAttemptDispatchLease({
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      runId: RUN_A,
      now,
    });
    const second = await acquireRenewalAttemptDispatchLease({
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      runId: RUN_B,
      now,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('lease_held');
  });

  test('expired lease can be re-acquired with new generation', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([{ dispatch_generation: 5 }]))
      .mockResolvedValueOnce(fakeQueryResult());

    const outcome = await acquireRenewalAttemptDispatchLease({
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      runId: RUN_B,
      now: new Date('2026-08-05T12:00:00.000Z'),
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.lease.generation).toBe(5);
      expect(outcome.lease.token).toBe(RUN_B);
    }
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain(
      'dispatch_lease_until IS NULL OR dispatch_lease_until <'
    );
  });
});

describe('attachRenewalProviderPaymentIdWithFence (PR-3c)', () => {
  test('stale generation cannot attach provider id', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([{ id: ATTEMPT_ID }]));

    const outcome = await attachRenewalProviderPaymentIdWithFence(
      {
        subscriptionPaymentId: ATTEMPT_ID,
        userId: USER_ID,
        token: RUN_A,
        generation: 1,
        leaseUntil: new Date(),
      },
      'yk-pay-stale'
    );

    expect(outcome).toBe('fence_rejected');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('dispatch_generation = $5');
  });

  test('current lease holder attaches provider id', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: ATTEMPT_ID }]));

    const outcome = await attachRenewalProviderPaymentIdWithFence(
      {
        subscriptionPaymentId: ATTEMPT_ID,
        userId: USER_ID,
        token: RUN_A,
        generation: 4,
        leaseUntil: new Date(),
      },
      'yk-pay-ok'
    );

    expect(outcome).toBe('attached');
  });
});

describe('claimRenewalFirstPostAtWithFence (PR-3c)', () => {
  test('stale generation cannot claim first_post_at', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([{ first_post_at: null }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const outcome = await claimRenewalFirstPostAtWithFence(
      {
        subscriptionPaymentId: ATTEMPT_ID,
        userId: USER_ID,
        token: RUN_A,
        generation: 1,
        leaseUntil: new Date(),
      },
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('fence_rejected');
  });
});

describe('releaseRenewalAttemptDispatchLease (PR-3c)', () => {
  test('release clears lease only for matching token and generation', async () => {
    await releaseRenewalAttemptDispatchLease(
      {
        subscriptionPaymentId: ATTEMPT_ID,
        userId: USER_ID,
        token: RUN_A,
        generation: 2,
        leaseUntil: new Date(),
      },
      new Date('2026-08-05T12:05:00.000Z')
    );

    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('dispatch_lease_token = NULL');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([ATTEMPT_ID, USER_ID, RUN_A, 2]);
  });
});

describe('createRenewalDispatchRunId (PR-3c)', () => {
  test('generates unique run ids', () => {
    expect(createRenewalDispatchRunId()).not.toBe(createRenewalDispatchRunId());
  });
});
