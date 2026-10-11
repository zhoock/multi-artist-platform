/**
 * PR-3a — renewal attempt bootstrap, frozen POST payload, and scheduler POST identity.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  };
});
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

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => false),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-test', secretKey: 'secret-test' })),
}));

const mockedGuardedPost = jest.fn();

jest.mock('../subscription-renewal-dispatch-lease', () => ({
  createRenewalDispatchRunId: jest.fn(() => 'run-test'),
  acquireRenewalAttemptDispatchLease: jest.fn(async () => ({
    ok: true,
    lease: {
      subscriptionPaymentId: '22222222-2222-4222-8222-222222222222',
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      token: 'run-test',
      generation: 1,
      leaseUntil: new Date('2099-01-01T00:00:00.000Z'),
    },
  })),
  releaseRenewalAttemptDispatchLease: jest.fn(async () => undefined),
  attachRenewalProviderPaymentIdWithFence: jest.fn(async () => 'attached'),
}));

jest.mock('../subscription-renewal-reconcile', () => ({
  guardedRenewalYooKassaPost: (...args: unknown[]) => mockedGuardedPost(...args),
  reconcileUnresolvedRenewalAttempts: jest.fn(async () => ({
    examined: 0,
    resolved: 0,
    pending: 0,
    needsReview: 0,
    retryLater: 0,
    errors: 0,
  })),
}));

import {
  createRenewalAttemptRow,
  findUnresolvedRenewalAttemptForSubscription,
  getRenewalAttemptPostIdentity,
} from '../subscription-billing';
import { attemptRenewalChargeForSubscription } from '../subscription-renewal-engine';
import {
  buildRenewalYookassaCreatePayload,
  canonicalJsonStringify,
  embedRenewalSubscriptionPaymentIdInPayload,
  hashRenewalRequestPayload,
  readRenewalSubscriptionPaymentIdFromPayload,
} from '../subscription-renewal-post-payload';

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const OPEN_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function samplePayload(planSlug: 'explorer' | 'collector' = 'explorer') {
  return buildRenewalYookassaCreatePayload({
    amountValue: planSlug === 'explorer' ? '1.00' : '2.00',
    description: `${planSlug} test`,
    userId: USER_ID,
    planSlug,
    customerEmail: 'renewal@test.example',
    paymentMethodId: 'pm-original',
  });
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    user_id: USER_ID,
    status: 'active',
    plan: 'explorer',
    slots_limit: 20,
    provider: 'yookassa',
    provider_subscription_id: null,
    started_at: new Date('2026-08-01T00:00:00.000Z'),
    expires_at: new Date('2026-09-01T00:00:00.000Z'),
    payment_method_id: 'pm-changed-later',
    next_charge_at: new Date('2026-08-05T00:00:00.000Z'),
    renewal_attempt_count: 0,
    scheduled_plan: null,
    first_failed_at: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
    previous_next_charge_at: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue(fakeQueryResult());
  clientQuery.mockResolvedValue(fakeQueryResult());
  mockedGuardedPost.mockResolvedValue({
    ok: true,
    paymentId: 'yk-pay-1',
    status: 'pending',
    route: 'initial_post',
  });
});

describe('createRenewalAttemptRow (PR-3a)', () => {
  test('persists attempt columns, hash, and idempotence key', async () => {
    const payload = samplePayload();
    const frozenPayload = embedRenewalSubscriptionPaymentIdInPayload(payload, PAYMENT_ROW_ID);
    const expectedHash = hashRenewalRequestPayload(frozenPayload);

    clientQuery.mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]));

    const id = await createRenewalAttemptRow({
      userId: USER_ID,
      subscriptionId: SUB_ID,
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      attemptNo: 1,
      planSlug: 'explorer',
      yookassaCreatePayload: payload,
    });

    expect(id).toBe(PAYMENT_ROW_ID);

    const insertSql = String(clientQuery.mock.calls[0]?.[0]);
    expect(insertSql).toContain('subscription_id');
    expect(insertSql).toContain('request_payload_hash');
    expect(insertSql).toContain('dispatch_phase');
    expect(insertSql).toContain('idempotence_key');
    expect(insertSql).toContain('created');
    expect(clientQuery.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        USER_ID,
        expect.any(Number),
        'RUB',
        'explorer',
        SUB_ID,
        new Date('2026-09-01T00:00:00.000Z'),
        1,
        expectedHash,
        `renewal-${PAYMENT_ROW_ID}`,
        expect.stringContaining('renewalYookassaCreatePayload'),
      ])
    );

    const rawJson = String(clientQuery.mock.calls[0]?.[1]?.[10] ?? '');
    expect(rawJson).toContain('subscriptionPaymentId');
    expect(readRenewalSubscriptionPaymentIdFromPayload(frozenPayload)).toBe(PAYMENT_ROW_ID);
  });

  test('surfaces unique violation when open renewal already exists for subscription', async () => {
    const payload = samplePayload();
    const frozenPayload = embedRenewalSubscriptionPaymentIdInPayload(payload, PAYMENT_ROW_ID);
    clientQuery.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value'), {
        code: '23505',
        message: 'idx_subscription_payments_one_open_renewal_per_subscription',
      })
    );

    await expect(
      createRenewalAttemptRow({
        userId: USER_ID,
        subscriptionId: SUB_ID,
        periodEnd: new Date('2026-09-01T00:00:00.000Z'),
        attemptNo: 1,
        planSlug: 'explorer',
        yookassaCreatePayload: payload,
      })
    ).rejects.toMatchObject({
      renewalAttemptCreateConflict: 'open_renewal_for_subscription',
    });
    expect(clientQuery).toHaveBeenCalledTimes(1);
    void frozenPayload;
  });
});

describe('getRenewalAttemptPostIdentity (PR-3a)', () => {
  test('rejects hash mismatch before POST', async () => {
    const payload = samplePayload();
    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([
        {
          idempotence_key: `renewal-${PAYMENT_ROW_ID}`,
          request_payload_hash: 'deadbeef',
          raw_last_event: { renewalYookassaCreatePayload: payload },
        },
      ])
    );

    const result = await getRenewalAttemptPostIdentity(PAYMENT_ROW_ID, USER_ID);
    expect(result).toEqual({ ok: false, reason: 'hash_mismatch' });
  });
});

describe('attemptRenewalChargeForSubscription frozen POST (PR-3a)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('charge path delegates production POST to guarded renewal helper', async () => {
    const frozenPayload = samplePayload('explorer');

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WITH candidate AS')) {
        return fakeQueryResult([claimRow()]);
      }
      if (sql.includes('SELECT email FROM users')) {
        return fakeQueryResult([{ email: 'renewal@test.example' }]);
      }
      if (sql.includes('SELECT sp.id, sp.idempotence_key, sp.request_payload_hash')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash, raw_last_event')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${PAYMENT_ROW_ID}`,
            request_payload_hash: hashRenewalRequestPayload(frozenPayload),
            raw_last_event: { renewalYookassaCreatePayload: frozenPayload },
          },
        ]);
      }
      if (sql.includes('first_post_at IS NULL')) {
        return fakeQueryResult([{ id: PAYMENT_ROW_ID }]);
      }
      return fakeQueryResult();
    });

    clientQuery
      .mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]))
      .mockResolvedValueOnce(fakeQueryResult());

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('attempted');
    expect(mockedGuardedPost).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionPaymentId: PAYMENT_ROW_ID,
        claimFirstPostWhenInitial: true,
      })
    );
    void frozenPayload;
  });

  test('open renewal blocks new charge claim (production guard)', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WITH candidate AS')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('skipped');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  test('hash mismatch blocks YooKassa POST', async () => {
    global.fetch = jest.fn<typeof fetch>();

    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WITH candidate AS')) {
        return fakeQueryResult([claimRow()]);
      }
      if (sql.includes('SELECT email FROM users')) {
        return fakeQueryResult([{ email: 'renewal@test.example' }]);
      }
      if (sql.includes('SELECT sp.id, sp.idempotence_key')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('SELECT idempotence_key, request_payload_hash')) {
        return fakeQueryResult([
          {
            idempotence_key: `renewal-${PAYMENT_ROW_ID}`,
            request_payload_hash: 'bad-hash',
            raw_last_event: { renewalYookassaCreatePayload: samplePayload() },
          },
        ]);
      }
      return fakeQueryResult();
    });

    clientQuery
      .mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]))
      .mockResolvedValueOnce(fakeQueryResult());

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('frozen payload stability (PR-3a)', () => {
  test('canonical hash is stable regardless of object key order', () => {
    const a = { z: 1, amount: { currency: 'RUB', value: '1.00' }, metadata: { plan: 'explorer' } };
    const b = { metadata: { plan: 'explorer' }, amount: { value: '1.00', currency: 'RUB' }, z: 1 };
    expect(hashRenewalRequestPayload(a)).toBe(hashRenewalRequestPayload(b));
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  test('findUnresolvedRenewalAttemptForSubscription scopes by subscription', async () => {
    await findUnresolvedRenewalAttemptForSubscription(SUB_ID);
    const sql = String(mockedQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('subscription_id = $1');
    expect(sql).not.toContain('subscription_id IS NULL');
    expect(sql).toContain("kind = 'renewal'");
  });
});
