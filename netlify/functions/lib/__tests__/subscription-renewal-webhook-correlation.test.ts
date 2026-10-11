/**
 * PR-4 — renewal webhook row correlation.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const mockedQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock('../db', () => ({
  query: mockedQuery,
  isMissingRelationError: jest.fn(() => false),
}));

import { resolveSubscriptionPaymentRowForVerifiedWebhook } from '../subscription-renewal-webhook-correlation';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ROW_ID = '33333333-3333-4333-8333-333333333333';
const YK_PAY_ID = '44444444-4444-4444-8444-444444444444';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function renewalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ROW_ID,
    user_id: USER_ID,
    provider: 'yookassa',
    provider_payment_id: null,
    status: 'pending',
    amount: '1.00',
    currency: 'RUB',
    plan: 'explorer',
    kind: 'renewal',
    raw_last_event: null,
    created_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedQuery.mockResolvedValue(fakeQueryResult());
});

describe('resolveSubscriptionPaymentRowForVerifiedWebhook (PR-4)', () => {
  test('renewal metadata finds row before provider_payment_id is stored', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        return fakeQueryResult([renewalRow()]);
      }
      if (sql.includes('provider_payment_id = $1') && sql.includes('id <> $2')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('provider_payment_id IS NULL')) {
        return fakeQueryResult([{ id: PAYMENT_ROW_ID }]);
      }
      if (sql.includes('WHERE id = $1 AND user_id = $2') && sql.includes('provider_payment_id')) {
        return fakeQueryResult([renewalRow({ provider_payment_id: YK_PAY_ID })]);
      }
      return fakeQueryResult();
    });

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correlation).toBe('renewal_metadata');
      expect(result.row.id).toBe(PAYMENT_ROW_ID);
      expect(result.providerIdLinked).toBe(true);
    }
  });

  test('metadata points to missing row', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'renewal payment row not found for metadata subscriptionPaymentId',
    });
  });

  test('metadata points to non-renewal row', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([renewalRow({ kind: 'initial' })]));

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('not a renewal');
    }
  });

  test('provider_payment_id already linked to another row', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WHERE id = $1 AND user_id = $2') && !sql.includes('UPDATE')) {
        return fakeQueryResult([renewalRow()]);
      }
      if (sql.includes('id <> $2::uuid')) {
        return fakeQueryResult([{ id: OTHER_ROW_ID }]);
      }
      return fakeQueryResult();
    });

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('another subscription payment');
    }
  });

  test('row provider_payment_id conflicts with verified payment id', async () => {
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        return fakeQueryResult([
          renewalRow({ provider_payment_id: '55555555-5555-4555-8555-555555555555' }),
        ]);
      }
      if (sql.includes('id <> $2::uuid')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('provider_payment_id conflict');
    }
  });

  test('renewal without subscriptionPaymentId rejects (no provider-only fallback)', async () => {
    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'renewal',
      metadataSubscriptionPaymentId: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('subscriptionPaymentId');
    }
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('initial checkout still resolves by provider_payment_id', async () => {
    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([renewalRow({ kind: 'initial', provider_payment_id: YK_PAY_ID })])
    );

    const result = await resolveSubscriptionPaymentRowForVerifiedWebhook({
      providerPaymentId: YK_PAY_ID,
      userId: USER_ID,
      metadataKind: 'initial',
      metadataSubscriptionPaymentId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correlation).toBe('provider_payment_id');
    }
  });
});
