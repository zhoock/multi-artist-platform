/**
 * Repeat checkout must not create a second YooKassa payment while one is open,
 * and a succeeded provider payment is recovered onto the existing operation.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';
import type { QueryResult } from 'pg';

jest.mock('node:dns', () => ({
  setDefaultResultOrder: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(),
  };
});

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../email-verification', () => ({
  isUserEmailVerified: jest.fn(async () => true),
}));

jest.mock('../subscription-billing', () => {
  const actual = jest.requireActual(
    '../subscription-billing'
  ) as typeof import('../subscription-billing');
  return {
    ...actual,
    createPendingSubscriptionPayment: jest.fn(async () => {
      throw new Error('must not create a second payment');
    }),
  };
});

jest.mock('../subscription-checkout-guard', () => ({
  resolveOpenSubscriptionCheckout: jest.fn(),
}));

import { getUserIdFromEvent } from '../api-helpers';
import { query } from '../db';
import { createPendingSubscriptionPayment } from '../subscription-billing';
import { resolveOpenSubscriptionCheckout } from '../subscription-checkout-guard';
import { handler } from '../../create-subscription-payment';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const SUBSCRIPTION_PAYMENT_ID = 'fdf2975f-c768-4164-8cd5-0ec6bde5ea02';
const PROVIDER_PAYMENT_ID = '325b203f-000f-5000-b000-118c53aaa8d7';

const mockedGetUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;
const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCreatePending = createPendingSubscriptionPayment as jest.MockedFunction<
  typeof createPendingSubscriptionPayment
>;
const mockedResolve = resolveOpenSubscriptionCheckout as jest.MockedFunction<
  typeof resolveOpenSubscriptionCheckout
>;

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

function checkoutEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({ plan: 'archivist' }),
    headers: {},
    isBase64Encoded: false,
    path: '/api/create-subscription-payment',
    rawUrl: '',
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  } as HandlerEvent;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetUserId.mockReturnValue(USER_ID);
  mockedQuery.mockResolvedValue(fakeQueryResult([{ email: 'user@example.com' }]));
});

describe('create-subscription-payment open checkout', () => {
  test('recovers a succeeded payment and does not create another one', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no new payment'));
    mockedResolve.mockResolvedValue({
      type: 'recovered',
      subscriptionPaymentId: SUBSCRIPTION_PAYMENT_ID,
      providerPaymentId: PROVIDER_PAYMENT_ID,
      subscriptionActivated: true,
    });

    const response = await handler(checkoutEvent(), {} as never);
    const body = JSON.parse(response?.body ?? '{}') as {
      success: boolean;
      data?: {
        paymentId?: string;
        subscriptionPaymentId?: string;
        subscriptionRecovered?: boolean;
      };
    };

    expect(response?.statusCode).toBe(200);
    expect(body.data).toEqual({
      paymentId: PROVIDER_PAYMENT_ID,
      subscriptionPaymentId: SUBSCRIPTION_PAYMENT_ID,
      subscriptionRecovered: true,
    });
    expect(mockedCreatePending).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('pending checkout returns the existing operation and does not create another payment', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no new payment'));
    mockedResolve.mockResolvedValue({
      type: 'in_progress',
      subscriptionPaymentId: SUBSCRIPTION_PAYMENT_ID,
      providerPaymentId: PROVIDER_PAYMENT_ID,
      confirmationUrl: 'https://yoomoney.ru/checkout/payments/v2/contract',
    });

    const response = await handler(checkoutEvent(), {} as never);
    const body = JSON.parse(response?.body ?? '{}') as {
      success: boolean;
      code?: string;
      subscriptionPaymentId?: string;
      confirmationUrl?: string;
    };

    expect(response?.statusCode).toBe(409);
    expect(body.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(body.subscriptionPaymentId).toBe(SUBSCRIPTION_PAYMENT_ID);
    expect(body.confirmationUrl).toBe('https://yoomoney.ru/checkout/payments/v2/contract');
    expect(mockedCreatePending).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
