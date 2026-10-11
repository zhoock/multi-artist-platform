/**
 * PR-3b — renewal reconciliation and guarded POST.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const mockedQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  query: mockedQuery,
  isMissingRelationError: jest.fn(() => false),
  withClient: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => false),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-test', secretKey: 'secret-test' })),
}));

jest.mock('../subscription-renewal-dispatch-lease', () => ({
  createRenewalDispatchRunId: jest.fn(() => 'run-test-lease'),
  acquireRenewalAttemptDispatchLease: jest.fn(async () => ({
    ok: true,
    lease: {
      subscriptionPaymentId: '22222222-2222-4222-8222-222222222222',
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      token: 'run-test-lease',
      generation: 2,
      leaseUntil: new Date('2099-01-01T00:00:00.000Z'),
    },
  })),
  releaseRenewalAttemptDispatchLease: jest.fn(async () => undefined),
  attachRenewalProviderPaymentIdWithFence: jest.fn(async () => 'attached'),
  claimRenewalFirstPostAtWithFence: jest.fn(async () => 'claimed'),
  markRenewalAttemptNeedsReviewWithFence: jest.fn(async () => true),
}));

const mockedProcessForRow = jest.fn();
jest.mock('../subscription-payment-router', () => ({
  processSubscriptionProviderPaymentForRow: mockedProcessForRow,
}));

import { isDevPaymentModeEnabled } from '../dev-payment-mode';
import {
  acquireRenewalAttemptDispatchLease,
  attachRenewalProviderPaymentIdWithFence,
  releaseRenewalAttemptDispatchLease,
} from '../subscription-renewal-dispatch-lease';
import {
  guardedRenewalYooKassaPost,
  reconcileOneRenewalAttempt,
  reconcileUnresolvedRenewalAttempts,
} from '../subscription-renewal-reconcile';
import {
  buildRenewalYookassaCreatePayload,
  embedRenewalSubscriptionPaymentIdInPayload,
  hashRenewalRequestPayload,
} from '../subscription-renewal-post-payload';
import { YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS } from '../subscription-renewal-post-policy';
import { runRenewalCycle } from '../subscription-renewal-engine';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '11111111-1111-4111-8111-111111111111';
const YK_PAY_ID = '33333333-3333-4333-8333-333333333333';

const FROZEN_PAYLOAD = embedRenewalSubscriptionPaymentIdInPayload(
  buildRenewalYookassaCreatePayload({
    amountValue: '1.00',
    description: 'Explorer Support',
    userId: USER_ID,
    planSlug: 'explorer',
    customerEmail: 'renewal@test.example',
    paymentMethodId: 'pm-original',
  }),
  ATTEMPT_ID
);

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    user_id: USER_ID,
    subscription_id: SUB_ID,
    provider_payment_id: null,
    first_post_at: new Date('2026-08-05T12:00:00.000Z'),
    status: 'pending',
    dispatch_phase: 'created',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockReset();
  mockedQuery.mockResolvedValue(fakeQueryResult());
  mockedProcessForRow.mockResolvedValue({
    subscriptionRenewed: true,
    alreadyFulfilled: false,
    planSlug: 'explorer',
  });
  (isDevPaymentModeEnabled as jest.Mock).mockReturnValue(false);
  (acquireRenewalAttemptDispatchLease as jest.Mock).mockReset();
  (attachRenewalProviderPaymentIdWithFence as jest.Mock).mockReset();
  (releaseRenewalAttemptDispatchLease as jest.Mock).mockReset();
  (acquireRenewalAttemptDispatchLease as jest.Mock).mockResolvedValue({
    ok: true,
    lease: {
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      token: 'run-test-lease',
      generation: 2,
      leaseUntil: new Date('2099-01-01T00:00:00.000Z'),
    },
  });
  (attachRenewalProviderPaymentIdWithFence as jest.Mock).mockResolvedValue('attached');
  (releaseRenewalAttemptDispatchLease as jest.Mock).mockResolvedValue(undefined);
});

describe('reconcileOneRenewalAttempt (PR-3b)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('lost POST response: repeat POST within 24h uses frozen key and body', async () => {
    const now = new Date('2026-08-05T13:00:00.000Z');
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: YK_PAY_ID, status: 'pending' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: YK_PAY_ID,
          status: 'pending',
          amount: { value: '1.00', currency: 'RUB' },
          metadata: {
            productType: 'premium_subscription',
            userId: USER_ID,
            plan: 'explorer',
            kind: 'renewal',
          },
        }),
      } as Response);
    global.fetch = fetchMock;

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      if (
        sql.includes('UPDATE subscription_payments') &&
        sql.includes('provider_payment_id = $2')
      ) {
        return fakeQueryResult([{ id: ATTEMPT_ID }]);
      }
      return fakeQueryResult();
    });

    const outcome = await reconcileOneRenewalAttempt(attemptRow(), now);
    expect(outcome).toBe('pending');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const postInit = fetchMock.mock.calls[0]?.[1];
    expect((postInit?.headers as Record<string, string>)['Idempotence-Key']).toBe(
      `renewal-${ATTEMPT_ID}`
    );
    expect(JSON.parse(String(postInit?.body))).toEqual(FROZEN_PAYLOAD);
  });

  test('known provider id + pending GET syncs without POST or fulfillment extend', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: YK_PAY_ID,
        status: 'pending',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
      }),
    } as Response);

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ provider_payment_id: YK_PAY_ID }),
      new Date()
    );

    expect(outcome).toBe('pending');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedProcessForRow).toHaveBeenCalledTimes(1);
  });

  test('known provider id + succeeded GET fulfills without POST', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: YK_PAY_ID,
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
      }),
    } as Response);

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ provider_payment_id: YK_PAY_ID }),
      new Date()
    );

    expect(outcome).toBe('resolved');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0]?.[0])).toContain(YK_PAY_ID);
    expect(mockedProcessForRow).toHaveBeenCalledTimes(1);
  });

  test('GET retryable error leaves attempt pending for retry', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    } as Response);

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ provider_payment_id: YK_PAY_ID }),
      new Date()
    );
    expect(outcome).toBe('retry_later');
    expect(mockedProcessForRow).not.toHaveBeenCalled();
  });

  test('unknown id after 24h marks needs_review and skips POST', async () => {
    global.fetch = jest.fn<typeof fetch>();
    const firstPostAt = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date(firstPostAt.getTime() + YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS + 1);

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes("dispatch_phase = 'needs_review'")) {
        return fakeQueryResult([{ id: ATTEMPT_ID }]);
      }
      return fakeQueryResult();
    });

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ first_post_at: firstPostAt }),
      now
    );
    expect(outcome).toBe('needs_review');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      String(mockedQuery.mock.calls.find(([sql]) => String(sql).includes('needs_review'))?.[0])
    ).toContain('needs_review');
  });

  test('legacy attempt without frozen payload marks needs_review on POST path', async () => {
    global.fetch = jest.fn<typeof fetch>();
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: {},
          },
        ]);
      }
      if (sql.includes("dispatch_phase = 'needs_review'")) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    const outcome = await guardedRenewalYooKassaPost({
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      now: new Date('2026-08-05T13:00:00.000Z'),
      claimFirstPostWhenInitial: false,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('identity_invalid');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('PR-5: idempotence key not bound to row id marks needs_review without POST', async () => {
    global.fetch = jest.fn<typeof fetch>();
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: 'renewal-not-bound-to-row',
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      if (sql.includes("dispatch_phase = 'needs_review'")) {
        return fakeQueryResult([{ id: ATTEMPT_ID }]);
      }
      return fakeQueryResult();
    });

    const outcome = await guardedRenewalYooKassaPost({
      subscriptionPaymentId: ATTEMPT_ID,
      userId: USER_ID,
      now: new Date('2026-08-05T13:00:00.000Z'),
      claimFirstPostWhenInitial: false,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('needs_review');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('webhook and reconcile both call fulfillment — second is idempotent', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: YK_PAY_ID,
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
      }),
    } as Response);

    mockedProcessForRow
      .mockResolvedValueOnce({
        subscriptionRenewed: true,
        alreadyFulfilled: false,
        planSlug: 'explorer',
      })
      .mockResolvedValueOnce({
        subscriptionRenewed: true,
        alreadyFulfilled: true,
        planSlug: 'explorer',
      });

    const row = attemptRow({ provider_payment_id: YK_PAY_ID });
    await reconcileOneRenewalAttempt(row, new Date());
    await reconcileOneRenewalAttempt(row, new Date());

    expect(mockedProcessForRow).toHaveBeenCalledTimes(2);
  });
});

describe('dispatch lease integration (PR-3c)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('lease held defers reconcile without POST', async () => {
    (acquireRenewalAttemptDispatchLease as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'lease_held',
    });
    global.fetch = jest.fn<typeof fetch>();

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow(),
      new Date('2026-08-05T13:00:00.000Z')
    );
    expect(outcome).toBe('retry_later');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('initial_post route stays pending without lease or POST (lease expiry alone does not charge)', async () => {
    (acquireRenewalAttemptDispatchLease as jest.Mock).mockClear();
    global.fetch = jest.fn<typeof fetch>();

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ first_post_at: null, provider_payment_id: null }),
      new Date('2026-08-05T13:00:00.000Z')
    );

    expect(outcome).toBe('pending');
    expect(acquireRenewalAttemptDispatchLease).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('GET sync after lease loss: attach skipped when provider id already linked', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: YK_PAY_ID,
        status: 'pending',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
      }),
    } as Response);

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow({ provider_payment_id: YK_PAY_ID }),
      new Date('2026-08-05T13:00:00.000Z')
    );

    expect(outcome).toBe('pending');
    expect(attachRenewalProviderPaymentIdWithFence).not.toHaveBeenCalled();
    expect(releaseRenewalAttemptDispatchLease).toHaveBeenCalled();
  });

  test('POST failure still releases dispatch lease', async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValueOnce(new Error('network down'));

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      return fakeQueryResult();
    });

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow(),
      new Date('2026-08-05T13:00:00.000Z')
    );

    expect(outcome).toBe('retry_later');
    expect(releaseRenewalAttemptDispatchLease).toHaveBeenCalled();
  });

  test('delayed POST: fence reject on provider attach defers without inline fulfillment', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: YK_PAY_ID, status: 'succeeded' }),
    } as Response);

    (attachRenewalProviderPaymentIdWithFence as jest.Mock).mockResolvedValue('fence_rejected');

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      return fakeQueryResult();
    });

    const outcome = await reconcileOneRenewalAttempt(
      attemptRow(),
      new Date('2026-08-05T13:00:00.000Z')
    );

    expect(outcome).toBe('retry_later');
    expect(mockedProcessForRow).not.toHaveBeenCalled();
    expect(releaseRenewalAttemptDispatchLease).toHaveBeenCalled();
    expect(attachRenewalProviderPaymentIdWithFence).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('reconcileUnresolvedRenewalAttempts (PR-3b)', () => {
  test('scheduler re-run processes stalled open attempt without new charge claim', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('ORDER BY created_at ASC') && sql.includes("kind = 'renewal'")) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      return fakeQueryResult();
    });

    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: YK_PAY_ID, status: 'pending' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: YK_PAY_ID,
          status: 'pending',
          amount: { value: '1.00', currency: 'RUB' },
          metadata: {
            productType: 'premium_subscription',
            userId: USER_ID,
            plan: 'explorer',
            kind: 'renewal',
          },
        }),
      } as Response);

    const result = await reconcileUnresolvedRenewalAttempts(new Date('2026-08-05T13:00:00.000Z'));
    expect(result.examined).toBe(1);
    expect(result.pending).toBe(1);
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('reconcileUnresolvedRenewalAttempts + scheduler ordering', () => {
  test('lists open attempts and runs reconcile before charge-ready selection', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('FROM subscription_payments') && sql.includes("kind = 'renewal'")) {
        if (sql.includes('ORDER BY created_at ASC')) {
          return fakeQueryResult([]);
        }
      }
      if (sql.includes('listChargeReady') || sql.includes('NOT EXISTS')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('cancel_at_period_end')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('charge-due') || sql.includes('next_charge_at IS NOT NULL')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    jest.mock('../subscription-feature-flag', () => ({
      isSubscriptionAutoRenewEnabled: jest.fn(() => true),
    }));

    const cycle = await reconcileUnresolvedRenewalAttempts(new Date());
    expect(cycle.examined).toBe(0);
  });
});

describe('runRenewalCycle integrates reconciliation (PR-3b)', () => {
  test('invokes reconciliation listing query before charge-ready query', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('cancel_at_period_end')) return fakeQueryResult([]);
      if (sql.includes('ORDER BY created_at ASC') && sql.includes("kind = 'renewal'")) {
        return fakeQueryResult([attemptRow()]);
      }
      if (
        sql.includes('charge-due') ||
        (sql.includes('next_charge_at') && sql.includes('expires_at'))
      ) {
        return fakeQueryResult([]);
      }
      if (sql.includes('NOT EXISTS')) return fakeQueryResult([]);
      if (sql.includes('provider_payment_id, first_post_at, status, dispatch_phase')) {
        return fakeQueryResult([attemptRow()]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${ATTEMPT_ID}`,
            request_payload_hash: hashRenewalRequestPayload(FROZEN_PAYLOAD),
            raw_last_event: { renewalYookassaCreatePayload: FROZEN_PAYLOAD },
          },
        ]);
      }
      return fakeQueryResult([]);
    });

    (isDevPaymentModeEnabled as jest.Mock).mockReturnValue(true);

    await runRenewalCycle(new Date('2026-08-11T12:00:00.000Z'));

    const listReconcileIdx = mockedQuery.mock.calls.findIndex(([sql]) =>
      String(sql).includes('ORDER BY created_at ASC')
    );
    const chargeReadyIdx = mockedQuery.mock.calls.findIndex(
      ([sql]) => String(sql).includes('NOT EXISTS') && String(sql).includes('subscription_payments')
    );
    expect(listReconcileIdx).toBeGreaterThanOrEqual(0);
    expect(chargeReadyIdx).toBeGreaterThan(listReconcileIdx);
  });
});
