/**
 * Checkout guard — release abandoned pending rows (I-P6).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevMarkedPayment: jest.fn(),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(),
}));

jest.mock('../yookassa-webhook-verify', () => ({
  fetchPaymentFromYooKassaApi: jest.fn(),
}));

import { query } from '../db';
import { isDevMarkedPayment } from '../dev-payment-mode';
import { getYooKassaEnvCredentials } from '../yookassa-env';
import { fetchPaymentFromYooKassaApi } from '../yookassa-webhook-verify';
import {
  findOpenCheckoutSubscriptionPayment,
  releaseAbandonedCheckoutPayments,
} from '../subscription-billing';
import { findBlockingCheckoutPayment } from '../subscription-checkout-guard';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedIsDevMarkedPayment = isDevMarkedPayment as jest.MockedFunction<
  typeof isDevMarkedPayment
>;
const mockedGetYooKassaEnvCredentials = getYooKassaEnvCredentials as jest.MockedFunction<
  typeof getYooKassaEnvCredentials
>;
const mockedFetchPaymentFromYooKassaApi = fetchPaymentFromYooKassaApi as jest.MockedFunction<
  typeof fetchPaymentFromYooKassaApi
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SUBSCRIPTION_PAYMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROVIDER_PAYMENT_ID = '321cef97-000f-5000-b000-18374df6380f';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetYooKassaEnvCredentials.mockReturnValue({
    shopId: 'shop-id',
    secretKey: 'secret-key',
  });
});

describe('releaseAbandonedCheckoutPayments', () => {
  test('cancels orphan pending checkout rows without provider_payment_id', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: 'pay-1' }], 1));

    const count = await releaseAbandonedCheckoutPayments(USER_ID);

    expect(count).toBe(1);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('provider_payment_id IS NULL');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('kind = ANY($2::text[])');
  });
});

describe('findOpenCheckoutSubscriptionPayment', () => {
  test('scopes open guard to checkout kinds only', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: 'pay-checkout' }]));

    const open = await findOpenCheckoutSubscriptionPayment(USER_ID);

    expect(open?.id).toBe('pay-checkout');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('kind = ANY($3::text[])');
  });
});

describe('findBlockingCheckoutPayment', () => {
  test('returns null after releasing orphans and finding no open checkout', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([], 0))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const open = await findBlockingCheckoutPayment(USER_ID);

    expect(open).toBeNull();
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  test('reconciles real YooKassa canceled payment even when dev payment mode is on', async () => {
    mockedIsDevMarkedPayment.mockReturnValue(false);
    mockedFetchPaymentFromYooKassaApi.mockResolvedValue({
      ok: true,
      payment: {
        id: PROVIDER_PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
      },
    });

    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([], 0))
      .mockResolvedValueOnce(fakeQueryResult([{ id: SUBSCRIPTION_PAYMENT_ID }]))
      .mockResolvedValueOnce(
        fakeQueryResult([
          {
            id: SUBSCRIPTION_PAYMENT_ID,
            user_id: USER_ID,
            provider: 'yookassa',
            provider_payment_id: PROVIDER_PAYMENT_ID,
            status: 'pending',
            amount: '1.00',
            currency: 'RUB',
            plan: 'archivist',
            kind: 'initial',
            raw_last_event: null,
            created_at: new Date(),
          },
        ])
      )
      .mockResolvedValueOnce(fakeQueryResult([{ id: SUBSCRIPTION_PAYMENT_ID }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const open = await findBlockingCheckoutPayment(USER_ID);

    expect(open).toBeNull();
    expect(mockedFetchPaymentFromYooKassaApi).toHaveBeenCalledWith(
      PROVIDER_PAYMENT_ID,
      'shop-id',
      'secret-key'
    );
    expect(mockedIsDevMarkedPayment).toHaveBeenCalledWith(null);
  });

  test('does not reconcile dev-marked payment and keeps checkout blocked', async () => {
    mockedIsDevMarkedPayment.mockReturnValue(true);

    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([], 0))
      .mockResolvedValueOnce(fakeQueryResult([{ id: SUBSCRIPTION_PAYMENT_ID }]))
      .mockResolvedValueOnce(
        fakeQueryResult([
          {
            id: SUBSCRIPTION_PAYMENT_ID,
            user_id: USER_ID,
            provider: 'yookassa',
            provider_payment_id: PROVIDER_PAYMENT_ID,
            status: 'pending',
            amount: '1.00',
            currency: 'RUB',
            plan: 'archivist',
            kind: 'initial',
            raw_last_event: { devPaymentMode: true },
            created_at: new Date(),
          },
        ])
      );

    const open = await findBlockingCheckoutPayment(USER_ID);

    expect(open).toEqual({ id: SUBSCRIPTION_PAYMENT_ID });
    expect(mockedFetchPaymentFromYooKassaApi).not.toHaveBeenCalled();
    expect(mockedIsDevMarkedPayment).toHaveBeenCalledWith({ devPaymentMode: true });
  });
});
