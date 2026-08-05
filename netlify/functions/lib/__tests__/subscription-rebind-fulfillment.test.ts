/**
 * Unit tests for subscription-rebind-fulfillment (PR-9).
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../archive', () => ({
  getMyArchiveForUser: jest.fn(),
}));

jest.mock('../subscription-billing', () => ({
  claimSubscriptionPaymentSuccess: jest.fn(),
  getRebindAmountRub: jest.fn(() => 1),
  updateSubscriptionPaymentStatus: jest.fn(),
  validateRebindSubscriptionPayment: jest.fn(),
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE: 'premium_subscription',
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
  mapSubscriptionRow: jest.fn((row: Record<string, unknown>) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    plan: row.plan,
    slotsLimit: row.slots_limit,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    paymentMethodId: row.payment_method_id,
    paymentMethodTitle: row.payment_method_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })),
}));

import { query } from '../db';
import { getMyArchiveForUser } from '../archive';
import {
  claimSubscriptionPaymentSuccess,
  updateSubscriptionPaymentStatus,
  validateRebindSubscriptionPayment,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import {
  fulfillRebindSubscriptionPayment,
  processRebindSubscriptionProviderPayment,
  processRebindSubscriptionProviderPaymentWithArchive,
} from '../subscription-rebind-fulfillment';
import type { SubscriptionProviderPayment } from '../subscription-provider-payment';
import { SUBSCRIPTION_PAYMENT_KIND_REBIND } from '../subscription-yookassa';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedClaim = claimSubscriptionPaymentSuccess as jest.MockedFunction<
  typeof claimSubscriptionPaymentSuccess
>;
const mockedValidate = validateRebindSubscriptionPayment as jest.MockedFunction<
  typeof validateRebindSubscriptionPayment
>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedGetArchive = getMyArchiveForUser as jest.MockedFunction<typeof getMyArchiveForUser>;
const mockedUpdateStatus = updateSubscriptionPaymentStatus as jest.MockedFunction<
  typeof updateSubscriptionPaymentStatus
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function rebindPayment(
  overrides: Partial<SubscriptionProviderPayment> = {}
): SubscriptionProviderPayment {
  return {
    id: 'pay-rebind-1',
    status: 'succeeded',
    amount: { value: '1.00', currency: 'RUB' },
    metadata: {
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'collector',
      kind: SUBSCRIPTION_PAYMENT_KIND_REBIND,
    },
    paymentMethod: {
      id: 'pm-new',
      saved: true,
      title: 'Visa •••• 4242',
    },
    ...overrides,
  };
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    user_id: USER_ID,
    status: 'past_due',
    plan: 'collector',
    slots_limit: 2,
    provider: 'yookassa',
    provider_subscription_id: 'pay-old',
    started_at: new Date('2026-07-01'),
    expires_at: new Date('2026-09-03'),
    payment_method_id: 'pm-new',
    payment_method_title: 'Visa •••• 4242',
    next_charge_at: null,
    renewal_attempt_count: 1,
    scheduled_plan: null,
    first_failed_at: new Date('2026-08-04'),
    created_at: new Date('2026-07-01'),
    updated_at: new Date('2026-08-05'),
    ...overrides,
  };
}

describe('processRebindSubscriptionProviderPayment', () => {
  const originalFlag = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    mockedValidate.mockReturnValue({ valid: true });
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: USER_ID,
      status: 'past_due',
      plan: 'collector',
      slotsLimit: 2,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-old',
      startedAt: new Date('2026-07-01'),
      expiresAt: new Date('2026-09-03'),
      paymentMethodId: 'pm-old',
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-08-05'),
    });
    mockedClaim.mockResolvedValue('claimed');
    mockedQuery.mockResolvedValue({ rows: [subscriptionRow()] } as QueryResult);
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = originalFlag;
  });

  test('successful rebind updates payment method', async () => {
    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.alreadyApplied).toBe(false);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('payment_method_title');
  });

  test('duplicate callback is idempotent', async () => {
    mockedClaim.mockResolvedValue('already_succeeded');

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.alreadyApplied).toBe(true);
  });

  test('cancelled rebind updates payment status only', async () => {
    const result = await processRebindSubscriptionProviderPayment(
      rebindPayment({ status: 'canceled' }),
      USER_ID
    );

    expect(result.paymentMethodUpdated).toBe(false);
    expect(mockedUpdateStatus).toHaveBeenCalledWith('pay-rebind-1', 'canceled');
    expect(mockedClaim).not.toHaveBeenCalled();
  });

  test('invalid payment method throws', async () => {
    await expect(
      processRebindSubscriptionProviderPayment(
        rebindPayment({ paymentMethod: { id: 'pm-x', saved: false, title: null } }),
        USER_ID
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_METHOD_NOT_SAVED' });
  });

  test('invalid rebind metadata throws', async () => {
    mockedValidate.mockReturnValue({ valid: false, reason: 'amount or currency' });

    await expect(
      processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('processRebindSubscriptionProviderPaymentWithArchive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    mockedValidate.mockReturnValue({ valid: true });
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: USER_ID,
      status: 'past_due',
      plan: 'collector',
      slotsLimit: 2,
      provider: null,
      providerSubscriptionId: null,
      startedAt: null,
      expiresAt: new Date('2026-09-03'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedClaim.mockResolvedValue('claimed');
    mockedQuery.mockResolvedValue({ rows: [subscriptionRow()] } as QueryResult);
    mockedGetArchive.mockResolvedValue({
      billing: { paymentMethodTitle: 'Visa •••• 4242' },
    } as never);
  });

  test('returns archive after successful rebind', async () => {
    const result = await processRebindSubscriptionProviderPaymentWithArchive(
      rebindPayment(),
      USER_ID
    );

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.archive).toEqual({ billing: { paymentMethodTitle: 'Visa •••• 4242' } });
    expect(mockedGetArchive).toHaveBeenCalledWith(USER_ID);
  });
});

describe('fulfillRebindSubscriptionPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue('claimed');
    mockedQuery.mockResolvedValue({ rows: [subscriptionRow()] } as QueryResult);
  });

  test('throws when payment row missing', async () => {
    mockedClaim.mockResolvedValue('not_found');

    await expect(
      fulfillRebindSubscriptionPayment({
        userId: USER_ID,
        providerPaymentId: 'pay-1',
        paymentMethodId: 'pm-1',
        paymentMethodTitle: 'Visa •••• 4242',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
