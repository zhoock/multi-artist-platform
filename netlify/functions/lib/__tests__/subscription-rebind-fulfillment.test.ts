/**
 * Unit tests for subscription-rebind-fulfillment (PR-9).
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import type { QueryResult } from 'pg';

const clientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  withTransaction: jest.fn((fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery })
  ),
}));

jest.mock('../archive', () => ({
  getMyArchiveForUser: jest.fn(),
}));

jest.mock('../subscription-billing', () => ({
  CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES: ['pending', 'waiting_for_capture'],
  getRebindAmountRub: jest.fn(() => 1),
  updateSubscriptionPaymentStatus: jest.fn(),
  validateRebindSubscriptionPayment: jest.fn(),
  readPaymentMethodEpoch: jest.fn(),
  readRebindOutcome: jest.fn(),
  REBIND_OUTCOME_APPLIED: 'applied',
  REBIND_OUTCOME_STALE_AFTER_UNLINK: 'stale_after_unlink',
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
    nextChargeAt: row.next_charge_at,
    paymentMethodEpoch: row.payment_method_epoch ?? 0,
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

import { getMyArchiveForUser } from '../archive';
import {
  readPaymentMethodEpoch,
  readRebindOutcome,
  REBIND_OUTCOME_APPLIED,
  REBIND_OUTCOME_STALE_AFTER_UNLINK,
  updateSubscriptionPaymentStatus,
  validateRebindSubscriptionPayment,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import { patchSubscriptionAutoRenew } from '../subscription-auto-renew-patch';
import {
  fulfillRebindSubscriptionPayment,
  isStaleRebindByEpoch,
  isSubscriptionPaymentMethodUnlinked,
  processRebindSubscriptionProviderPayment,
  processRebindSubscriptionProviderPaymentWithArchive,
} from '../subscription-rebind-fulfillment';
import type { SubscriptionProviderPayment } from '../subscription-provider-payment';
import { SUBSCRIPTION_PAYMENT_KIND_REBIND } from '../subscription-yookassa';

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
const mockedReadEpoch = readPaymentMethodEpoch as jest.MockedFunction<
  typeof readPaymentMethodEpoch
>;
const mockedReadOutcome = readRebindOutcome as jest.MockedFunction<typeof readRebindOutcome>;
const mockedPatchAutoRenew = patchSubscriptionAutoRenew as jest.MockedFunction<
  typeof patchSubscriptionAutoRenew
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

function resumeRebindPayment(
  overrides: Partial<SubscriptionProviderPayment> = {}
): SubscriptionProviderPayment {
  return rebindPayment({
    ...overrides,
    metadata: {
      ...rebindPayment().metadata,
      resumeAutoRenew: 'true',
      ...overrides.metadata,
    },
  });
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    user_id: USER_ID,
    status: 'cancel_at_period_end',
    plan: 'collector',
    slots_limit: 2,
    provider: 'yookassa',
    provider_subscription_id: 'pay-old',
    started_at: new Date('2026-07-01'),
    expires_at: new Date('2026-09-03'),
    payment_method_id: 'pm-new',
    payment_method_title: 'Visa •••• 4242',
    next_charge_at: null,
    renewal_attempt_count: 0,
    scheduled_plan: null,
    first_failed_at: null,
    payment_method_epoch: 0,
    created_at: new Date('2026-07-01'),
    updated_at: new Date('2026-08-05'),
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
    paymentMethodEpoch: 1,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-08-05'),
    ...overrides,
  };
}

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<Record<string, unknown>> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

describe('isStaleRebindByEpoch', () => {
  test('returns false when PM is still linked', () => {
    expect(
      isStaleRebindByEpoch(
        {
          ...unlinkedSubscription(),
          paymentMethodId: 'pm-old',
        } as never,
        0
      )
    ).toBe(false);
  });

  test('returns true when payment epoch is older than subscription epoch', () => {
    expect(isStaleRebindByEpoch(unlinkedSubscription() as never, 0)).toBe(true);
  });

  test('returns false when payment epoch matches subscription epoch', () => {
    expect(isStaleRebindByEpoch(unlinkedSubscription() as never, 1)).toBe(false);
  });
});

describe('isSubscriptionPaymentMethodUnlinked', () => {
  test('detects unlinked subscription', () => {
    expect(isSubscriptionPaymentMethodUnlinked(unlinkedSubscription() as never)).toBe(true);
  });
});

describe('fulfillRebindSubscriptionPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReadOutcome.mockReturnValue(null);
    mockedReadEpoch.mockReturnValue(1);
  });

  test('returns cached stale outcome without applying PM', async () => {
    mockedReadOutcome.mockReturnValue(REBIND_OUTCOME_STALE_AFTER_UNLINK);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([{ id: 'sp-1', status: 'succeeded', raw_last_event: {} }])
      )
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow({ payment_method_id: null })]));

    const result = await fulfillRebindSubscriptionPayment({
      userId: USER_ID,
      providerPaymentId: 'pay-rebind-1',
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
    });

    expect(result.staleAfterUnlink).toBe(true);
    expect(result.applied).toBe(false);
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  test('marks stale outcome and succeeds payment when epoch is stale', async () => {
    mockedReadEpoch.mockReturnValue(0);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'pending', raw_last_event: { paymentMethodEpoch: 0 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_title: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await fulfillRebindSubscriptionPayment({
      userId: USER_ID,
      providerPaymentId: 'pay-rebind-1',
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
    });

    expect(result.staleAfterUnlink).toBe(true);
    const staleUpdateParams = clientQuery.mock.calls[2]?.[1] as unknown[] | undefined;
    expect(JSON.stringify(staleUpdateParams?.[2] ?? '')).toContain('stale_after_unlink');
  });

  test('applies PM then claims success for fresh checkout', async () => {
    mockedReadEpoch.mockReturnValue(1);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'pending', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_title: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow()]))
      .mockResolvedValueOnce(fakeQueryResult([{ id: 'sp-1' }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await fulfillRebindSubscriptionPayment({
      userId: USER_ID,
      providerPaymentId: 'pay-rebind-1',
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
    });

    expect(result.applied).toBe(true);
    expect(result.staleAfterUnlink).toBe(false);
    expect(String(clientQuery.mock.calls[2]?.[0])).toContain('payment_method_id');
    expect(String(clientQuery.mock.calls[3]?.[0])).toContain("status = 'succeeded'");
  });

  test('returns cached applied outcome on duplicate callback', async () => {
    mockedReadOutcome.mockReturnValue(REBIND_OUTCOME_APPLIED);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'succeeded', raw_last_event: { rebindOutcome: 'applied' } },
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow()]));

    const result = await fulfillRebindSubscriptionPayment({
      userId: USER_ID,
      providerPaymentId: 'pay-rebind-1',
      paymentMethodId: 'pm-new',
      paymentMethodTitle: 'Visa •••• 4242',
    });

    expect(result.alreadyApplied).toBe(true);
    expect(result.applied).toBe(false);
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  test('rolls back when apply fails and leaves payment retryable', async () => {
    mockedReadEpoch.mockReturnValue(1);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'pending', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockRejectedValueOnce(new Error('apply failed'));

    await expect(
      fulfillRebindSubscriptionPayment({
        userId: USER_ID,
        providerPaymentId: 'pay-rebind-1',
        paymentMethodId: 'pm-new',
        paymentMethodTitle: 'Visa •••• 4242',
      })
    ).rejects.toThrow('apply failed');
  });
});

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
      paymentMethodEpoch: 0,
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-08-05'),
    });
    mockedReadOutcome.mockReturnValue(null);
    mockedReadEpoch.mockReturnValue(1);
    mockedPatchAutoRenew.mockResolvedValue({
      subscription: unlinkedSubscription({
        status: 'active',
        paymentMethodId: 'pm-new',
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
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'pending', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow({ payment_method_id: 'pm-old' })]))
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow()]))
      .mockResolvedValueOnce(fakeQueryResult([{ id: 'sp-1' }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(result.staleAfterUnlink).toBe(false);
  });

  test('stale rebind after unlink does not restore PM', async () => {
    mockedReadEpoch.mockReturnValue(0);
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'succeeded', raw_last_event: { paymentMethodEpoch: 0 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_title: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(false);
    expect(result.staleAfterUnlink).toBe(true);
  });

  test('fresh rebind after unlink restores PM without enabling auto-renew', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'succeeded', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_title: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'cancel_at_period_end',
            payment_method_id: 'pm-new',
            next_charge_at: null,
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([{ status: 'succeeded' }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await processRebindSubscriptionProviderPayment(rebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(mockedPatchAutoRenew).not.toHaveBeenCalled();
  });

  test('resume → no PM → rebind succeeded → enables auto-renew', async () => {
    mockedGetSubscription.mockResolvedValue(unlinkedSubscription());
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'succeeded', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            payment_method_id: null,
            payment_method_epoch: 1,
          }),
        ])
      )
      .mockResolvedValueOnce(
        fakeQueryResult([
          subscriptionRow({
            status: 'cancel_at_period_end',
            payment_method_id: 'pm-new',
          }),
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([{ status: 'succeeded' }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await processRebindSubscriptionProviderPayment(resumeRebindPayment(), USER_ID);

    expect(result.paymentMethodUpdated).toBe(true);
    expect(mockedPatchAutoRenew).toHaveBeenCalledWith(USER_ID, true);
  });

  test('cancelled rebind updates payment status only', async () => {
    const result = await processRebindSubscriptionProviderPayment(
      rebindPayment({ status: 'canceled' }),
      USER_ID
    );

    expect(result.paymentMethodUpdated).toBe(false);
    expect(mockedUpdateStatus).toHaveBeenCalledWith('pay-rebind-1', 'canceled');
    expect(clientQuery).not.toHaveBeenCalled();
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
      paymentMethodEpoch: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedReadOutcome.mockReturnValue(null);
    mockedReadEpoch.mockReturnValue(1);
    mockedGetArchive.mockResolvedValue({
      billing: { paymentMethodTitle: 'Visa •••• 4242' },
    } as never);
    clientQuery
      .mockResolvedValueOnce(
        fakeQueryResult([
          { id: 'sp-1', status: 'pending', raw_last_event: { paymentMethodEpoch: 1 } },
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow({ payment_method_id: 'pm-old' })]))
      .mockResolvedValueOnce(fakeQueryResult([subscriptionRow()]))
      .mockResolvedValueOnce(fakeQueryResult([{ id: 'sp-1' }]))
      .mockResolvedValueOnce(fakeQueryResult([]));
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
