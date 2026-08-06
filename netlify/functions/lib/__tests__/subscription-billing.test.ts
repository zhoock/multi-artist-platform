/**
 * Unit tests for multi-tier subscription billing (PLAN_CATALOG, fulfillment).
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

import { query } from '../db';
import {
  PLAN_CATALOG,
  computeSupportExpiresAt,
  DEFAULT_SUBSCRIPTION_PLAN,
  fulfillSubscriptionPayment,
  formatPlanAmountValue,
  getPlanAmountRub,
  getPlanPriceCurrencyCode,
  getPlanSlotsLimit,
  normalizeSubscriptionPlanSlug,
  validatePremiumSubscriptionPayment,
  validateRebindSubscriptionPayment,
} from '../subscription-billing';

const SUBSCRIPTION_CURRENCY = getPlanPriceCurrencyCode();
const EXPLORER_AMOUNT = formatPlanAmountValue('explorer');
const COLLECTOR_AMOUNT = formatPlanAmountValue('collector');
const MISMATCH_AMOUNT = '99.00';

const mockedQuery = query as jest.MockedFunction<typeof query>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    user_id: USER_ID,
    status: 'active',
    plan: 'explorer',
    slots_limit: 1,
    provider: 'yookassa',
    provider_subscription_id: 'pay-1',
    started_at: new Date('2026-06-20T10:00:00.000Z'),
    expires_at: new Date('2026-06-20T11:00:00.000Z'),
    created_at: new Date('2026-06-20T10:00:00.000Z'),
    updated_at: new Date('2026-06-20T10:00:00.000Z'),
    ...overrides,
  };
}

describe('PLAN_CATALOG', () => {
  test('defines explorer, collector, archivist with production slot limits', () => {
    expect(getPlanSlotsLimit('explorer')).toBe(20);
    expect(getPlanSlotsLimit('collector')).toBe(60);
    expect(getPlanSlotsLimit('archivist')).toBe(100);
  });

  test('uses 1-hour support period in development', () => {
    const from = new Date('2026-06-20T12:00:00.000Z');
    const expires = computeSupportExpiresAt('explorer', from);
    expect(expires.getTime() - from.getTime()).toBe(60 * 60 * 1000);
  });

  test('uses 30-day support period in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.YOOKASSA_TEST_MODE = 'false';
    process.env.NETLIFY_DEV = 'false';
    const from = new Date('2026-06-20T12:00:00.000Z');
    const expires = computeSupportExpiresAt('explorer', from);
    expect(expires.getTime() - from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('normalizeSubscriptionPlanSlug', () => {
  test('accepts known plan slugs', () => {
    expect(normalizeSubscriptionPlanSlug('collector')).toBe('collector');
    expect(normalizeSubscriptionPlanSlug('archivist')).toBe('archivist');
  });

  test('rejects unknown slugs', () => {
    expect(normalizeSubscriptionPlanSlug('premium')).toBeNull();
    expect(normalizeSubscriptionPlanSlug('')).toBeNull();
  });

  test('defaults to explorer when omitted at call site', () => {
    expect(DEFAULT_SUBSCRIPTION_PLAN).toBe('explorer');
  });
});

describe('getPlanAmountRub', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('returns 1 RUB in non-production dev pricing', () => {
    process.env.NODE_ENV = 'test';
    expect(getPlanAmountRub('explorer')).toBe(1);
    expect(getPlanAmountRub('archivist')).toBe(1);
  });

  test('returns catalog price in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.YOOKASSA_TEST_MODE = 'false';
    process.env.NETLIFY_DEV = 'false';
    expect(getPlanAmountRub('explorer')).toBe(1);
    expect(getPlanAmountRub('archivist')).toBe(1);
  });
});

describe('validatePremiumSubscriptionPayment', () => {
  const amountsEqual = (a: string, b: string) => a === b;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  test('accepts valid explorer payment metadata', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'explorer',
      amountValue: EXPLORER_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: true, planSlug: 'explorer' });
  });

  test('validates amount per plan in dev pricing', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'collector',
      amountValue: COLLECTOR_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: true, planSlug: 'collector' });
  });

  test('rejects unknown plan', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'legacy',
      amountValue: EXPLORER_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: false, reason: 'plan metadata' });
  });

  test('rejects amount mismatch', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'explorer',
      amountValue: MISMATCH_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: false, reason: 'amount or currency' });
  });
});

describe('validateRebindSubscriptionPayment', () => {
  const amountsEqual = (a: string, b: string) => a === b;

  test('accepts valid rebind payment metadata', () => {
    const result = validateRebindSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      kind: 'rebind',
      amountValue: EXPLORER_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: true });
  });

  test('rejects wrong kind', () => {
    const result = validateRebindSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      kind: 'initial',
      amountValue: EXPLORER_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      amountsEqual,
    });
    expect(result).toEqual({ valid: false, reason: 'kind metadata' });
  });
});

describe('fulfillSubscriptionPayment', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));
    mockedQuery.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('creates new subscription with catalog plan and slots', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([])).mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRow({
          plan: 'collector',
          slots_limit: 60,
          expires_at: new Date('2026-06-20T13:00:00.000Z'),
        }),
      ])
    );

    const result = await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'collector',
      providerPaymentId: 'pay-new',
    });

    expect(result.plan).toBe('collector');
    expect(result.slotsLimit).toBe(60);
    expect(result.expiresAt?.getTime()).toBe(new Date('2026-06-20T13:00:00.000Z').getTime());

    const insertCall = mockedQuery.mock.calls[1];
    expect(insertCall?.[1]).toEqual([
      USER_ID,
      'collector',
      60,
      'pay-new',
      new Date('2026-06-20T12:00:00.000Z'),
      new Date('2026-06-20T13:00:00.000Z'),
    ]);
  });

  test('upgrade on active subscription updates plan, slots, and new period without deactivating archive', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([subscriptionRow({ plan: 'explorer', slots_limit: 1 })])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            plan: 'archivist',
            slots_limit: 100,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([], 2));

    const result = await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'archivist',
      providerPaymentId: 'pay-upgrade',
    });

    expect(result.plan).toBe('archivist');
    expect(result.slotsLimit).toBe(100);

    const updateCall = mockedQuery.mock.calls[1];
    expect(updateCall?.[1]?.[1]).toBe('archivist');
    expect(updateCall?.[1]?.[2]).toBe(100);
    expect(updateCall?.[1]?.[6]).toEqual(new Date('2026-06-20T13:00:00.000Z'));

    expect(mockedQuery.mock.calls[2]).toBeUndefined();
  });

  test('same-plan renewal does not deactivate archive artists', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 1,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      );

    await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: 'pay-renew-same-plan',
    });

    expect(mockedQuery.mock.calls.length).toBe(2);
  });

  test('renew on expired subscription resets started_at', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'expired',
            plan: 'explorer',
            slots_limit: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 1,
            started_at: new Date('2026-06-20T12:00:00.000Z'),
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      );

    await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: 'pay-renew',
    });

    const updateCall = mockedQuery.mock.calls[1];
    expect(updateCall?.[1]?.[4]).toBe(true);
    expect(updateCall?.[1]?.[5]).toEqual(new Date('2026-06-20T12:00:00.000Z'));
  });

  test('resubscribe on expired clears stale autorenew and dunning fields', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'expired',
            plan: 'explorer',
            slots_limit: 20,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 20,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      );

    await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: 'pay-resubscribe',
    });

    const updateSql = String(mockedQuery.mock.calls[1]?.[0]);
    expect(updateSql).toContain('scheduled_plan = CASE WHEN $5 THEN NULL');
    expect(updateSql).toContain('renewal_attempt_count = CASE WHEN $5 THEN 0');
    expect(updateSql).toContain('first_failed_at = CASE WHEN $5 THEN NULL');
    expect(updateSql).toContain('next_charge_at = CASE WHEN $5 THEN NULL');
    expect(mockedQuery.mock.calls[1]?.[1]?.[4]).toBe(true);
  });

  test('active renewal does not clear autorenew fields in UPDATE', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 20,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'active',
            plan: 'explorer',
            slots_limit: 20,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      );

    await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: 'pay-renew-active',
    });

    expect(mockedQuery.mock.calls[1]?.[1]?.[4]).toBe(false);
  });
});
