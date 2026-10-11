/**
 * PR-4 — premium subscription webhook correlation (renewal).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';
import type { QueryResult } from 'pg';

const mockedQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockedFetchApi = jest.fn();
const mockedProcessForRow = jest.fn();

jest.mock('../db', () => ({
  query: mockedQuery,
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-test', secretKey: 'secret-test' })),
}));

jest.mock('../yookassa-webhook-verify', () => ({
  amountsEqual: (a: string, b: string) =>
    Number.parseFloat(a).toFixed(2) === Number.parseFloat(b).toFixed(2),
  expectedStatusForEvent: jest.fn((event: string) =>
    event === 'payment.succeeded' ? 'succeeded' : event === 'payment.canceled' ? 'canceled' : null
  ),
  fetchPaymentFromYooKassaApi: (...args: unknown[]) => mockedFetchApi(...args),
  getClientIpFromEvent: jest.fn(() => '127.0.0.1'),
  isNotificationIpAllowed: jest.fn(() => true),
  metaString: (metadata: Record<string, string | undefined> | undefined, key: string) => {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  },
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(async () => ({
    id: 'sub-1',
    userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    status: 'active',
    plan: 'explorer',
    billingOrigin: 'production',
  })),
}));

jest.mock('../subscription-billing-origin', () => ({
  checkBillingMutationAllowed: jest.fn(() => ({ allowed: true })),
  allowsProductionBillingFulfillmentDespiteOriginGuard: jest.fn(() => true),
}));

jest.mock('../subscription-payment-router', () => ({
  processSubscriptionProviderPaymentForRow: (...args: unknown[]) => mockedProcessForRow(...args),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevMarkedPayment: jest.fn(() => false),
}));

import { handlePremiumSubscriptionWebhookIfApplicable } from '../subscription-webhook';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const YK_PAY_ID = '33333333-3333-4333-8333-333333333333';

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

function apiPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: YK_PAY_ID,
    status: 'succeeded',
    amount: { value: '1.00', currency: 'RUB' },
    metadata: {
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'explorer',
      kind: 'renewal',
      subscriptionPaymentId: PAYMENT_ROW_ID,
    },
    test: false,
    ...overrides,
  };
}

function webhookBody(event: string, metadata?: Record<string, string>) {
  return {
    type: 'notification',
    event,
    object: {
      id: YK_PAY_ID,
      status: event === 'payment.succeeded' ? 'succeeded' : 'pending',
      amount: { value: '1.00', currency: 'RUB' },
      metadata: metadata ?? {
        productType: 'premium_subscription',
        userId: USER_ID,
        plan: 'explorer',
        kind: 'renewal',
      },
    },
  };
}

const headers = { 'Content-Type': 'application/json' };
const baseEvent = { headers: {} } as HandlerEvent;

beforeEach(() => {
  mockedQuery.mockReset();
  mockedFetchApi.mockReset();
  mockedProcessForRow.mockReset();
  mockedProcessForRow.mockResolvedValue({
    subscriptionRenewed: true,
    alreadyFulfilled: false,
    planSlug: 'explorer',
  });
  mockedQuery.mockImplementation(async (text) => {
    const sql = String(text);
    if (sql.includes('INSERT INTO webhook_events')) {
      return fakeQueryResult([{ id: 'evt-1' }]);
    }
    return fakeQueryResult();
  });
});

describe('handlePremiumSubscriptionWebhookIfApplicable renewal correlation (PR-4)', () => {
  test('webhook before provider_payment_id links row via API metadata', async () => {
    mockedFetchApi.mockResolvedValue({ ok: true, payment: apiPayment() });
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('INSERT INTO webhook_events')) {
        return fakeQueryResult([{ id: 'evt-1' }]);
      }
      if (sql.includes('WHERE id = $1 AND user_id = $2') && !sql.includes('UPDATE')) {
        return fakeQueryResult([renewalRow(), renewalRow({ provider_payment_id: YK_PAY_ID })]);
      }
      if (sql.includes('id <> $2::uuid')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('provider_payment_id IS NULL')) {
        return fakeQueryResult([{ id: PAYMENT_ROW_ID }]);
      }
      return fakeQueryResult();
    });

    const response = await handlePremiumSubscriptionWebhookIfApplicable(
      baseEvent,
      webhookBody('payment.succeeded'),
      headers
    );

    expect(JSON.parse(response.body).processed).toBe(true);
    expect(mockedProcessForRow).toHaveBeenCalledTimes(1);
    expect(mockedProcessForRow.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ subscriptionPaymentId: PAYMENT_ROW_ID })
    );
  });

  test('verified webhook but API payment not succeeded skips fulfillment', async () => {
    mockedFetchApi.mockResolvedValue({
      ok: true,
      payment: apiPayment({ status: 'pending' }),
    });

    const response = await handlePremiumSubscriptionWebhookIfApplicable(
      baseEvent,
      webhookBody('payment.succeeded'),
      headers
    );

    const body = JSON.parse(response.body);
    expect(body.processed).toBe(false);
    expect(body.message).toContain('status mismatch');
    expect(mockedProcessForRow).not.toHaveBeenCalled();
  });

  test('duplicate webhook event does not process fulfillment twice', async () => {
    mockedFetchApi.mockResolvedValue({ ok: true, payment: apiPayment() });
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('INSERT INTO webhook_events')) {
        return fakeQueryResult([]);
      }
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        return fakeQueryResult([renewalRow({ provider_payment_id: YK_PAY_ID })]);
      }
      if (sql.includes("provider = 'yookassa' AND provider_payment_id = $1")) {
        return fakeQueryResult([renewalRow({ provider_payment_id: YK_PAY_ID })]);
      }
      return fakeQueryResult();
    });

    const response = await handlePremiumSubscriptionWebhookIfApplicable(
      baseEvent,
      webhookBody('payment.succeeded'),
      headers
    );

    expect(JSON.parse(response.body).duplicate).toBe(true);
    expect(mockedProcessForRow).not.toHaveBeenCalled();
  });

  test('renewal webhook without subscriptionPaymentId is skipped (no provider fallback)', async () => {
    mockedFetchApi.mockResolvedValue({
      ok: true,
      payment: apiPayment({
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
      }),
    });
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('INSERT INTO webhook_events')) {
        return fakeQueryResult([{ id: 'evt-1' }]);
      }
      return fakeQueryResult();
    });

    const response = await handlePremiumSubscriptionWebhookIfApplicable(
      baseEvent,
      webhookBody('payment.succeeded'),
      headers
    );

    const body = JSON.parse(response.body);
    expect(body.processed).not.toBe(true);
    expect(mockedProcessForRow).not.toHaveBeenCalled();
  });

  test('metadata subscriptionPaymentId mismatch with row rejects fulfillment', async () => {
    mockedFetchApi.mockResolvedValue({
      ok: true,
      payment: apiPayment({
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
          subscriptionPaymentId: '99999999-9999-4999-8999-999999999999',
        },
      }),
    });
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        return fakeQueryResult([]);
      }
      return fakeQueryResult();
    });

    const response = await handlePremiumSubscriptionWebhookIfApplicable(
      baseEvent,
      webhookBody('payment.succeeded'),
      headers
    );

    const body = JSON.parse(response.body);
    expect(body.processed).toBe(false);
    expect(mockedProcessForRow).not.toHaveBeenCalled();
  });
});
