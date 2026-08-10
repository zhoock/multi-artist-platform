/**
 * Unit tests for subscription-payment-method-unlink.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';

jest.mock('../db', () => ({
  withTransaction: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

import { withTransaction } from '../db';
import { isSubscriptionAutoRenewEnabled } from '../subscription-feature-flag';
import {
  SubscriptionPaymentMethodUnlinkError,
  unlinkSubscriptionPaymentMethod,
} from '../subscription-payment-method-unlink';

const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockedFlag = isSubscriptionAutoRenewEnabled as jest.MockedFunction<
  typeof isSubscriptionAutoRenewEnabled
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SUB_ID = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXPIRES = new Date('2026-09-03T00:00:00.000Z');

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    user_id: USER_ID,
    status: 'active',
    plan: 'explorer',
    slots_limit: 1,
    provider: 'yookassa',
    provider_subscription_id: 'pay-1',
    started_at: new Date('2026-08-01T00:00:00.000Z'),
    expires_at: EXPIRES,
    payment_method_id: 'pm-test',
    payment_method_title: 'Visa •••• 4242',
    next_charge_at: EXPIRES,
    renewal_attempt_count: 0,
    scheduled_plan: null,
    first_failed_at: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeQueryResult(rows: Record<string, unknown>[]): QueryResult {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}

describe('unlinkSubscriptionPaymentMethod', () => {
  let clientQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlag.mockReturnValue(true);
    clientQuery = jest.fn();
    mockedWithTransaction.mockImplementation(async (fn) =>
      fn({ query: clientQuery } as unknown as PoolClient)
    );
  });

  test('active + PM → clears PM fields and disables auto-renew', async () => {
    clientQuery.mockResolvedValueOnce(fakeQueryResult([subscriptionRow()])).mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: null,
          payment_method_title: null,
          next_charge_at: null,
        }),
      ])
    );

    const result = await unlinkSubscriptionPaymentMethod(USER_ID);

    expect(result.unlinked).toBe(true);
    expect(result.subscription.paymentMethodId).toBeNull();
    expect(result.subscription.paymentMethodTitle).toBeNull();
    expect(result.subscription.nextChargeAt).toBeNull();
    expect(result.subscription.status).toBe('cancel_at_period_end');
    expect(result.billing.autoRenewEnabled).toBe(false);
    expect(result.billing.hasSavedPaymentMethod).toBe(false);
    expect(result.subscription.expiresAt).toEqual(EXPIRES);

    expect(String(clientQuery.mock.calls[1]?.[0])).toContain('payment_method_id = NULL');
    expect(clientQuery.mock.calls[1]?.[1]).toEqual([SUB_ID, 'cancel_at_period_end', USER_ID]);
  });

  test('past_due + PM → clears PM without changing status', async () => {
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'past_due',
            renewal_attempt_count: 2,
            first_failed_at: new Date('2026-08-04T00:00:00.000Z'),
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'past_due',
            payment_method_id: null,
            payment_method_title: null,
            next_charge_at: null,
            renewal_attempt_count: 2,
            first_failed_at: new Date('2026-08-04T00:00:00.000Z'),
          }),
        ])
      );

    const result = await unlinkSubscriptionPaymentMethod(USER_ID);

    expect(result.subscription.status).toBe('past_due');
    expect(result.subscription.paymentMethodId).toBeNull();
    expect(clientQuery.mock.calls[1]?.[1]).toEqual([SUB_ID, 'past_due', USER_ID]);
  });

  test('idempotent when PM already absent', async () => {
    clientQuery.mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: null,
          payment_method_title: null,
          next_charge_at: null,
        }),
      ])
    );

    const result = await unlinkSubscriptionPaymentMethod(USER_ID);

    expect(result.unlinked).toBe(false);
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('no subscription → NO_SUBSCRIPTION', async () => {
    clientQuery.mockResolvedValueOnce(fakeQueryResult([]));

    await expect(unlinkSubscriptionPaymentMethod(USER_ID)).rejects.toMatchObject({
      code: 'NO_SUBSCRIPTION',
      httpStatus: 404,
    });
  });

  test('flag off → FEATURE_DISABLED', async () => {
    mockedFlag.mockReturnValue(false);

    await expect(unlinkSubscriptionPaymentMethod(USER_ID)).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      httpStatus: 503,
    });
    expect(mockedWithTransaction).not.toHaveBeenCalled();
  });
});
