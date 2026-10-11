/**
 * PR-2 — first_post_at guards against deleting renewal attempts after YooKassa POST may have started.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const mockedQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const clientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  query: mockedQuery,
  isMissingRelationError: jest.fn(() => false),
  withClient: jest.fn((fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery })
  ),
  withTransaction: jest.fn((fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery })
  ),
}));

import {
  cancelOrphanPendingRenewalPayments,
  claimRenewalFirstPostAt,
  cleanupPendingRenewalPayment,
  hasUnresolvedRenewalPostStartedWithClient,
} from '../subscription-billing';
import { rollbackRenewalChargeAttempt } from '../subscription-renewal-engine';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '11111111-1111-4111-8111-111111111111';
const RESTORE_AT = new Date('2026-08-01T00:00:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue(fakeQueryResult());
  clientQuery.mockResolvedValue(fakeQueryResult());
});

describe('claimRenewalFirstPostAt (PR-2)', () => {
  test('returns claimed when UPDATE touches a row', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]))
      .mockResolvedValueOnce(fakeQueryResult());

    await expect(
      claimRenewalFirstPostAt(PAYMENT_ROW_ID, USER_ID, new Date('2026-08-05T12:00:00.000Z'))
    ).resolves.toBe('claimed');

    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('first_post_at = $3');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('first_post_at IS NULL');
  });

  test('returns already_started when first_post_at is set', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('UPDATE subscription_payments') && sql.includes('first_post_at IS NULL')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('SELECT first_post_at')) {
        return fakeQueryResult([{ first_post_at: new Date('2026-08-05T12:00:00.000Z') }]);
      }
      return fakeQueryResult();
    });

    await expect(claimRenewalFirstPostAt(PAYMENT_ROW_ID, USER_ID)).resolves.toBe('already_started');
  });
});

describe('cancelOrphanPendingRenewalPayments (PR-2)', () => {
  test('SQL excludes rows with first_post_at set', async () => {
    await cancelOrphanPendingRenewalPayments(USER_ID);

    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('first_post_at IS NULL');
  });
});

describe('hasUnresolvedRenewalPostStartedWithClient (PR-2)', () => {
  test('detects renewal row with first_post_at and no provider id', async () => {
    clientQuery.mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]));

    await expect(
      hasUnresolvedRenewalPostStartedWithClient(
        { query: clientQuery } as never,
        PAYMENT_ROW_ID,
        USER_ID
      )
    ).resolves.toBe(true);
  });
});

describe('rollbackRenewalChargeAttempt with unresolved POST (PR-2)', () => {
  test('skips next_charge_at restore when post started without provider id', async () => {
    clientQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (
        sql.includes('first_post_at IS NOT NULL') &&
        sql.includes('provider_payment_id IS NULL')
      ) {
        return fakeQueryResult([{ id: PAYMENT_ROW_ID }]);
      }
      return fakeQueryResult();
    });

    await rollbackRenewalChargeAttempt({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      restoreNextChargeAt: RESTORE_AT,
      subscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(
      clientQuery.mock.calls.some(([sql]) => String(sql).includes('next_charge_at = $2'))
    ).toBe(false);
  });
});

describe('cleanupPendingRenewalPayment legacy path (PR-2)', () => {
  test('DELETE requires first_post_at IS NULL', async () => {
    await cleanupPendingRenewalPayment(PAYMENT_ROW_ID, USER_ID);

    expect(String(clientQuery.mock.calls[0]?.[0])).toContain('first_post_at IS NULL');
  });
});
