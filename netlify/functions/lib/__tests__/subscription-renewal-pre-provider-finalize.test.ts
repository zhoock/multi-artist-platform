/**
 * PRE_PROVIDER atomic rollback vs quarantine (PR-10.1).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const clientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
  withTransaction: jest.fn((fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery })
  ),
}));

jest.mock('../subscription-billing', () => ({
  cleanupPendingRenewalPaymentWithClient: jest.fn(),
}));

import { cleanupPendingRenewalPaymentWithClient } from '../subscription-billing';
import {
  quarantinePreProviderInvalidRenewalPaymentMethod,
  rollbackRenewalChargeAttempt,
} from '../subscription-renewal-engine';

const mockedCleanupWithClient = cleanupPendingRenewalPaymentWithClient as jest.MockedFunction<
  typeof cleanupPendingRenewalPaymentWithClient
>;

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPTED_PM = 'pm-stub-not-saved';
const RESTORE_AT = new Date('2026-08-01T00:00:00.000Z');
const CLAIM_LOCK_UNTIL = new Date('2026-08-05T12:30:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCleanupWithClient.mockResolvedValue(undefined);
  clientQuery.mockResolvedValue(fakeQueryResult());
});

describe('rollbackRenewalChargeAttempt', () => {
  test('runs pending cleanup and restore in one transaction', async () => {
    await rollbackRenewalChargeAttempt({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      restoreNextChargeAt: RESTORE_AT,
      subscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(mockedCleanupWithClient).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQuery }),
      PAYMENT_ROW_ID,
      USER_ID
    );
    const restoreCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCall?.[1]).toEqual([SUB_ID, RESTORE_AT, USER_ID]);
    expect(
      clientQuery.mock.calls.some(([sql]) => String(sql).includes('payment_method_id = NULL'))
    ).toBe(false);
  });
});

describe('quarantinePreProviderInvalidRenewalPaymentMethod', () => {
  test('atomically cleans pending and quarantines matching payment method', async () => {
    clientQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('payment_method_id = $3') && sql.includes('RETURNING id')) {
        return fakeQueryResult([{ id: SUB_ID }]);
      }
      return fakeQueryResult();
    });

    const result = await quarantinePreProviderInvalidRenewalPaymentMethod({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      attemptedPaymentMethodId: ATTEMPTED_PM,
      subscriptionPaymentId: PAYMENT_ROW_ID,
      restoreNextChargeAtIfPaymentMethodChanged: RESTORE_AT,
      claimLockUntil: CLAIM_LOCK_UNTIL,
    });

    expect(result).toBe('quarantined');
    expect(mockedCleanupWithClient).toHaveBeenCalledTimes(1);
    const quarantineCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('payment_method_id = NULL')
    );
    expect(quarantineCall?.[1]).toEqual([SUB_ID, USER_ID, ATTEMPTED_PM]);
    expect(
      clientQuery.mock.calls.filter(([sql]) => String(sql).includes('next_charge_at = $2'))
    ).toHaveLength(0);
  });

  test('preserves new PM and restores next_charge_at when payment method changed', async () => {
    clientQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('payment_method_id = $3') && sql.includes('payment_method_id = NULL')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('next_charge_at = $4') && sql.includes('RETURNING id')) {
        return fakeQueryResult([{ id: SUB_ID }]);
      }
      return fakeQueryResult();
    });

    const result = await quarantinePreProviderInvalidRenewalPaymentMethod({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      attemptedPaymentMethodId: ATTEMPTED_PM,
      subscriptionPaymentId: PAYMENT_ROW_ID,
      restoreNextChargeAtIfPaymentMethodChanged: RESTORE_AT,
      claimLockUntil: CLAIM_LOCK_UNTIL,
    });

    expect(result).toBe('payment_method_changed');
    expect(
      clientQuery.mock.calls.filter(([sql]) => String(sql).includes('payment_method_id = NULL'))
    ).toHaveLength(1);
    const restoreCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('next_charge_at = $4')
    );
    expect(restoreCall?.[1]).toEqual([SUB_ID, RESTORE_AT, USER_ID, CLAIM_LOCK_UNTIL]);
  });

  test('skips next_charge_at restore when claim lock was overwritten concurrently', async () => {
    clientQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('payment_method_id = NULL')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('next_charge_at = $4') && sql.includes('RETURNING id')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    const result = await quarantinePreProviderInvalidRenewalPaymentMethod({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      attemptedPaymentMethodId: ATTEMPTED_PM,
      subscriptionPaymentId: PAYMENT_ROW_ID,
      restoreNextChargeAtIfPaymentMethodChanged: RESTORE_AT,
      claimLockUntil: CLAIM_LOCK_UNTIL,
    });

    expect(result).toBe('payment_method_changed_next_charge_conflict');
    const restoreCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('next_charge_at = $4')
    );
    expect(restoreCall?.[1]).toEqual([SUB_ID, RESTORE_AT, USER_ID, CLAIM_LOCK_UNTIL]);
  });
});
