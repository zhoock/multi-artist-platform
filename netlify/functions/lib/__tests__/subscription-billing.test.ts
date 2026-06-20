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
  getPlanAmountRub,
  getPlanSlotsLimit,
  normalizeSubscriptionPlanSlug,
  validatePremiumSubscriptionPayment,
} from '../subscription-billing';

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
  test('defines explorer, collector, archivist with dev slot limits', () => {
    expect(getPlanSlotsLimit('explorer')).toBe(1);
    expect(getPlanSlotsLimit('collector')).toBe(2);
    expect(getPlanSlotsLimit('archivist')).toBe(3);
  });

  test('uses 1-hour support period in development', () => {
    const from = new Date('2026-06-20T12:00:00.000Z');
    const expires = computeSupportExpiresAt('explorer', from);
    expect(expires.getTime() - from.getTime()).toBe(
      PLAN_CATALOG.explorer.durationHours * 60 * 60 * 1000
    );
  });
});

describe('normalizeSubscriptionPlanSlug', () => {
  test('maps legacy archive to explorer', () => {
    expect(normalizeSubscriptionPlanSlug('archive')).toBe('explorer');
  });

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

  test('returns catalog production price in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.YOOKASSA_TEST_MODE = 'false';
    process.env.NETLIFY_DEV = 'false';
    expect(getPlanAmountRub('explorer')).toBe(PLAN_CATALOG.explorer.priceRubProduction);
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
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });
    expect(result).toEqual({ valid: true, planSlug: 'explorer' });
  });

  test('accepts legacy archive metadata as explorer', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'archive',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });
    expect(result).toEqual({ valid: true, planSlug: 'explorer' });
  });

  test('validates amount per plan in dev pricing', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'collector',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });
    expect(result).toEqual({ valid: true, planSlug: 'collector' });
  });

  test('rejects unknown plan', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'legacy',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });
    expect(result).toEqual({ valid: false, reason: 'plan metadata' });
  });

  test('rejects amount mismatch', () => {
    const result = validatePremiumSubscriptionPayment({
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'explorer',
      amountValue: '99.00',
      currency: 'RUB',
      amountsEqual,
    });
    expect(result).toEqual({ valid: false, reason: 'amount or currency' });
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
          slots_limit: 2,
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
    expect(result.slotsLimit).toBe(2);
    expect(result.expiresAt?.getTime()).toBe(new Date('2026-06-20T13:00:00.000Z').getTime());

    const insertCall = mockedQuery.mock.calls[1];
    expect(insertCall?.[1]).toEqual([
      USER_ID,
      'collector',
      2,
      'pay-new',
      new Date('2026-06-20T12:00:00.000Z'),
      new Date('2026-06-20T13:00:00.000Z'),
    ]);
  });

  test('upgrade on active subscription updates plan, slots, and new period', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([subscriptionRow({ plan: 'explorer', slots_limit: 1 })])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            plan: 'archivist',
            slots_limit: 3,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      );

    const result = await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'archivist',
      providerPaymentId: 'pay-upgrade',
    });

    expect(result.plan).toBe('archivist');
    expect(result.slotsLimit).toBe(3);

    const updateCall = mockedQuery.mock.calls[1];
    expect(updateCall?.[1]?.[1]).toBe('archivist');
    expect(updateCall?.[1]?.[2]).toBe(3);
    expect(updateCall?.[1]?.[6]).toEqual(new Date('2026-06-20T13:00:00.000Z'));
  });

  test('downgrade deactivates all archive artists on plan change', async () => {
    mockedQuery
      .mockResolvedValueOnce(
        fakeQueryResult([subscriptionRow({ plan: 'archivist', slots_limit: 3 })])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            plan: 'explorer',
            slots_limit: 1,
            expires_at: new Date('2026-06-20T13:00:00.000Z'),
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([], 3));

    const result = await fulfillSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: 'pay-downgrade',
    });

    expect(result.plan).toBe('explorer');
    expect(result.slotsLimit).toBe(1);

    const deactivateCall = mockedQuery.mock.calls[2];
    expect(String(deactivateCall?.[0])).toContain('is_active = false');
    expect(deactivateCall?.[1]?.[0]).toBe(USER_ID);
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
});
