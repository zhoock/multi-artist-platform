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
  getSubscriptionPaymentForUser: jest.fn(),
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

jest.mock('../subscription-auto-renew-patch', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  SubscriptionAutoRenewPatchError: class SubscriptionAutoRenewPatchError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly httpStatus: number
    ) {
      super(message);
      this.name = 'SubscriptionAutoRenewPatchError';
    }
  },
}));

import { query } from '../db';
import { getMyArchiveForUser } from '../archive';
import {
  claimSubscriptionPaymentSuccess,
  getSubscriptionPaymentForUser,
  updateSubscriptionPaymentStatus,
  validateRebindSubscriptionPayment,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import { patchSubscriptionAutoRenew } from '../subscription-auto-renew-patch';
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
const mockedGetPayment = getSubscriptionPaymentForUser as jest.MockedFunction<
  typeof getSubscriptionPaymentForUser
>;
const mockedPatchAutoRenew = patchSubscriptionAutoRenew as jest.MockedFunction<
  typeof patchSubscriptionAutoRenew
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNLINK_AT = new Date('2026-08-05T12:00:00.000Z');
const STALE_PAYMENT_CREATED_AT = new Date('2026-08-05T11:00:00.000Z');
const FRESH_PAYMENT_CREATED_AT = new Date('2026-08-05T12:00:01.000Z');

function resumeRebindPayment(
  overrides: Partial<SubscriptionProviderPayment> = {}
): SubscriptionProviderPayment {
  const base = rebindPayment(overrides);
  return {
    ...base,
    metadata: {
      ...base.metadata,
      resumeAutoRenew: 'true',
      ...overrides.metadata,
    },
  };
}

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

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp-rebind-1',
    user_id: USER_ID,
    provider: 'yookassa',
    provider_payment_id: 'pay-rebind-1',
    status: 'succeeded',
    amount: '1.00',
    currency: 'RUB',
    plan: 'collector',
    kind: SUBSCRIPTION_PAYMENT_KIND_REBIND,
    created_at: STALE_PAYMENT_CREATED_AT,
    ...overrides,
  };
}

function unlinkedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: USER_ID,
    status: 'cancel_at_period_end' as const,
    plan: 'collector',
    slotsLimit: 2,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-old',
    startedAt: new Date('2026-07-01'),
    expiresAt: new Date('2026-09-03'),
    paymentMethodId: null,
    paymentMethodTitle: null,
    nextChargeAt: null,
    createdAt: new Date('2026-07-01'),
    updatedAt: UNLINK_AT,
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
      nextChargeAt: new Date('2026-09-03'),
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-08-05'),
    });
    mockedClaim.mockResolvedValue('claimed');
    mockedQuery.mockResolvedValue({ rows: [subscriptionRow()] } as QueryResult);
    mockedGetPayment.mockResolvedValue(paymentRow() as never);
    mockedPatchAutoRenew.mockResolvedValue({
      subscription: unlinkedSubscription({
        status: 'active',
        paymentMethodId: 'pm-new',
        paymentMethodTitle: 'Visa •••• 4242',
        nextChargeAt: new Date('2026-09-03'),
      }),
      billing: {} as never,
    });
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

  test('duplicate callback is idempotent when PM is still linked', async () => {
    mockedClaim.mockResolvedValue('already_succeeded');

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.alreadyApplied).toBe(true);
  });

  test('stale rebind after unlink does not restore PM', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: STALE_PAYMENT_CREATED_AT }) as never
    );

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(false);
    expect(result.alreadyApplied).toBe(false);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('fresh rebind after unlink restores PM without enabling auto-renew', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: FRESH_PAYMENT_CREATED_AT }) as never
    );
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.alreadyApplied).toBe(false);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const sql = String(mockedQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('payment_method_id');
    expect(sql).not.toMatch(/next_charge_at\s*=/);
    expect(sql).not.toMatch(/SET[\s\S]*\bstatus\s*=/);
    expect(mockedPatchAutoRenew).not.toHaveBeenCalled();
  });

  test('rebind created at unlink timestamp is treated as fresh', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    mockedGetPayment.mockResolvedValue(paymentRow({ created_at: UNLINK_AT }) as never);
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  test('duplicate callback of a fresh post-unlink rebind is idempotent', async () => {
    const linkedAfterFreshRebind = {
      ...unlinkedSubscription(),
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
    };
    mockedGetSubscription
      .mockResolvedValueOnce(unlinkedSubscription())
      .mockResolvedValueOnce(unlinkedSubscription())
      .mockResolvedValueOnce(linkedAfterFreshRebind)
      .mockResolvedValueOnce(linkedAfterFreshRebind);
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: FRESH_PAYMENT_CREATED_AT }) as never
    );
    mockedClaim.mockResolvedValueOnce('claimed').mockResolvedValueOnce('already_succeeded');
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const first = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);
    const second = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(first.paymentMethodUpdated).toBe(true);
    expect(first.alreadyApplied).toBe(false);
    expect(second.paymentMethodUpdated).toBe(true);
    expect(second.alreadyApplied).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
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

  test('resume → no PM → rebind succeeded → enables auto-renew', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: FRESH_PAYMENT_CREATED_AT }) as never
    );
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const result = await processRebindSubscriptionProviderPayment(resumeRebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(mockedPatchAutoRenew).toHaveBeenCalledTimes(1);
    expect(mockedPatchAutoRenew).toHaveBeenCalledWith(USER_ID, true);
  });

  test('change payment method rebind does not change auto-renew state', async () => {
    mockedGetSubscription.mockResolvedValue({
      ...unlinkedSubscription(),
      paymentMethodId: 'pm-old',
      paymentMethodTitle: 'Visa •••• 1111',
    });
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(mockedPatchAutoRenew).not.toHaveBeenCalled();
  });

  test('duplicate resume-flow rebind is idempotent', async () => {
    const linkedAfterResume = {
      ...unlinkedSubscription(),
      status: 'active' as const,
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
      nextChargeAt: new Date('2026-09-03'),
    };
    mockedGetSubscription
      .mockResolvedValueOnce(unlinkedSubscription())
      .mockResolvedValueOnce(unlinkedSubscription())
      .mockResolvedValueOnce(linkedAfterResume)
      .mockResolvedValueOnce(linkedAfterResume);
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: FRESH_PAYMENT_CREATED_AT }) as never
    );
    mockedClaim.mockResolvedValueOnce('claimed').mockResolvedValueOnce('already_succeeded');
    mockedQuery.mockResolvedValue({
      rows: [
        subscriptionRow({
          status: 'cancel_at_period_end',
          payment_method_id: 'pm-new',
          next_charge_at: null,
        }),
      ],
    } as QueryResult);

    const first = await processRebindSubscriptionProviderPayment(resumeRebindPayment(), USER_ID);
    const second = await processRebindSubscriptionProviderPayment(resumeRebindPayment(), USER_ID);

    expect(first.paymentMethodUpdated).toBe(true);
    expect(first.alreadyApplied).toBe(false);
    expect(second.paymentMethodUpdated).toBe(true);
    expect(second.alreadyApplied).toBe(true);
    expect(mockedPatchAutoRenew).toHaveBeenCalledTimes(1);
    expect(mockedPatchAutoRenew).toHaveBeenCalledWith(USER_ID, true);
  });

  test('stale resume-flow rebind does not enable auto-renew', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    mockedGetPayment.mockResolvedValue(
      paymentRow({ created_at: STALE_PAYMENT_CREATED_AT }) as never
    );

    const result = await processRebindSubscriptionProviderPayment(resumeRebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(false);
    expect(mockedPatchAutoRenew).not.toHaveBeenCalled();
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
      paymentMethodId: 'pm-old',
      nextChargeAt: new Date('2026-09-03'),
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
