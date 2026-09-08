/**
 * YooKassa refund.succeeded webhook handler tests.
 */

import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();
const getDecryptedSecretKeyMock = jest.fn();
const getSubscriptionPaymentByProviderIdMock = jest.fn();
const revokeAlbumPurchaseForRefundMock = jest.fn();
const fetchRefundFromYooKassaApiMock = jest.fn();

jest.mock('../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

jest.mock('../../payment-settings', () => ({
  getDecryptedSecretKey: (...args: unknown[]) => getDecryptedSecretKeyMock(...args),
}));

jest.mock('../subscription-billing', () => ({
  getSubscriptionPaymentByProviderId: (...args: unknown[]) =>
    getSubscriptionPaymentByProviderIdMock(...args),
}));

jest.mock('../revoke-album-purchase-refund', () => ({
  revokeAlbumPurchaseForRefund: (...args: unknown[]) => revokeAlbumPurchaseForRefundMock(...args),
}));

jest.mock('../yookassa-webhook-verify', () => {
  const actual = jest.requireActual('../yookassa-webhook-verify') as Record<string, unknown>;
  return {
    ...actual,
    fetchRefundFromYooKassaApi: (...args: unknown[]) => fetchRefundFromYooKassaApiMock(...args),
    isNotificationIpAllowed: () => true,
  };
});

jest.mock('../subscription-webhook', () => ({
  handlePremiumSubscriptionWebhookIfApplicable: jest.fn(async () => null),
}));

jest.mock('../fulfill-album-purchase', () => ({
  applyAlbumPaymentSucceededFulfillment: jest.fn(async () => ({
    purchaseId: 'pur-1',
    purchaseToken: 'token-1',
    paymentId: 'pay-1',
  })),
}));

jest.mock('../email', () => ({
  sendPurchaseEmail: jest.fn(async () => ({ success: true })),
}));

import { describe, expect, test, afterEach, beforeEach } from '@jest/globals';
import { handler } from '../../payment-webhook';

const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const SELLER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';
const PAYMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddd04';
const REFUND_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05';
const OTHER_ORDER_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff06';
const OTHER_PAYMENT_ID = '11111111-1111-4111-8111-111111111107';

function buildRefundEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': '185.71.76.1' },
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/.netlify/functions/payment-webhook',
    rawUrl: '',
    queryStringParameters: {},
  } as HandlerEvent;
}

function refundBody(overrides: Record<string, unknown> = {}) {
  return {
    type: 'notification',
    event: 'refund.succeeded',
    object: {
      id: REFUND_ID,
      status: 'succeeded',
      payment_id: PAYMENT_ID,
      amount: { value: '499.00', currency: 'RUB' },
      ...overrides,
    },
  };
}

function paymentSucceededBody() {
  return {
    type: 'notification',
    event: 'payment.succeeded',
    object: {
      id: PAYMENT_ID,
      status: 'succeeded',
      amount: { value: '499.00', currency: 'RUB' },
      metadata: { orderId: ORDER_ID, albumId: 'album-slug', customerEmail: 'buyer@test.com' },
    },
  };
}

function mockOrderResolve(providerPaymentId: string, orderId: string) {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM payments p') && sql.includes('provider_payment_id')) {
      if (params?.[0] === providerPaymentId) {
        return {
          rows: [
            {
              id: orderId,
              user_id: SELLER_ID,
              album_id: 'album-slug',
              amount: '499.00',
              currency: 'RUB',
              payment_id: providerPaymentId,
            },
          ],
        };
      }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO webhook_events')) {
      return { rows: [{ id: 'evt-1' }] };
    }
    if (sql.includes('SELECT id FROM payments') && sql.includes('provider_payment_id')) {
      return { rows: [{ id: 'pay-row-1' }] };
    }
    return { rows: [] };
  });
}

describe('payment-webhook refund.succeeded', () => {
  beforeEach(() => {
    process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK = 'true';
    queryMock.mockReset();
    getDecryptedSecretKeyMock.mockReset();
    getSubscriptionPaymentByProviderIdMock.mockReset();
    revokeAlbumPurchaseForRefundMock.mockReset();
    fetchRefundFromYooKassaApiMock.mockReset();

    getDecryptedSecretKeyMock.mockResolvedValue({ shopId: 'shop-1', secretKey: 'secret-1' });
    getSubscriptionPaymentByProviderIdMock.mockResolvedValue(null);
    revokeAlbumPurchaseForRefundMock.mockResolvedValue({ outcome: 'revoked', purchaseId: 'pur-1' });
    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: REFUND_ID,
        status: 'succeeded',
        payment_id: PAYMENT_ID,
        amount: { value: '499.00', currency: 'RUB' },
      },
    });
  });

  afterEach(() => {
    delete process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK;
  });

  test('successful full refund revokes purchase for matching order', async () => {
    mockOrderResolve(PAYMENT_ID, ORDER_ID);

    const response = await handler(buildRefundEvent(refundBody()), {} as never);
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(true);
    expect(revokeAlbumPurchaseForRefundMock).toHaveBeenCalledWith(ORDER_ID);
  });

  test('unknown payment id is safe no-op', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const response = await handler(
      buildRefundEvent(refundBody({ payment_id: 'unknown-payment-id' })),
      {} as never
    );
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(false);
    expect(revokeAlbumPurchaseForRefundMock).not.toHaveBeenCalled();
  });

  test('refund for one payment does not revoke another order purchase', async () => {
    mockOrderResolve(PAYMENT_ID, ORDER_ID);

    await handler(buildRefundEvent(refundBody()), {} as never);

    expect(revokeAlbumPurchaseForRefundMock).toHaveBeenCalledWith(ORDER_ID);
    expect(revokeAlbumPurchaseForRefundMock).not.toHaveBeenCalledWith(OTHER_ORDER_ID);

    revokeAlbumPurchaseForRefundMock.mockClear();
    mockOrderResolve(OTHER_PAYMENT_ID, OTHER_ORDER_ID);
    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: REFUND_ID,
        status: 'succeeded',
        payment_id: OTHER_PAYMENT_ID,
        amount: { value: '499.00', currency: 'RUB' },
      },
    });

    await handler(
      buildRefundEvent(
        refundBody({
          payment_id: OTHER_PAYMENT_ID,
        })
      ),
      {} as never
    );

    expect(revokeAlbumPurchaseForRefundMock).toHaveBeenCalledWith(OTHER_ORDER_ID);
    expect(revokeAlbumPurchaseForRefundMock).not.toHaveBeenCalledWith(ORDER_ID);
  });

  test('duplicate refund webhook is idempotent no-op', async () => {
    mockOrderResolve(PAYMENT_ID, ORDER_ID);
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM payments p') && params?.[0] === PAYMENT_ID) {
        return {
          rows: [
            {
              id: ORDER_ID,
              user_id: SELLER_ID,
              album_id: 'album-slug',
              amount: '499.00',
              currency: 'RUB',
              payment_id: PAYMENT_ID,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO webhook_events')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM payments')) {
        return { rows: [{ id: 'pay-row-1' }] };
      }
      return { rows: [] };
    });

    const response = await handler(buildRefundEvent(refundBody()), {} as never);
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(revokeAlbumPurchaseForRefundMock).not.toHaveBeenCalled();
  });

  test('already revoked purchase is handled via revoke helper no-op', async () => {
    mockOrderResolve(PAYMENT_ID, ORDER_ID);
    revokeAlbumPurchaseForRefundMock.mockResolvedValue({
      outcome: 'already_revoked',
      purchaseId: 'pur-1',
    });

    const response = await handler(buildRefundEvent(refundBody()), {} as never);
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(true);
    expect(revokeAlbumPurchaseForRefundMock).toHaveBeenCalledWith(ORDER_ID);
  });

  test('partial refund does not revoke purchase', async () => {
    mockOrderResolve(PAYMENT_ID, ORDER_ID);
    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: REFUND_ID,
        status: 'succeeded',
        payment_id: PAYMENT_ID,
        amount: { value: '100.00', currency: 'RUB' },
      },
    });

    const response = await handler(
      buildRefundEvent(
        refundBody({
          amount: { value: '100.00', currency: 'RUB' },
        })
      ),
      {} as never
    );
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(false);
    expect(body.message).toContain('Partial refund');
    expect(revokeAlbumPurchaseForRefundMock).not.toHaveBeenCalled();
  });

  test('payment.succeeded still routes to payment flow (not refund handler)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM payments p')) {
        return {
          rows: [
            {
              id: ORDER_ID,
              user_id: SELLER_ID,
              album_id: 'album-slug',
              amount: '499.00',
              currency: 'RUB',
              payment_id: PAYMENT_ID,
            },
          ],
        };
      }
      return { rows: [] };
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: PAYMENT_ID,
        status: 'succeeded',
        amount: { value: '499.00', currency: 'RUB' },
        metadata: { orderId: ORDER_ID, albumId: 'album-slug', customerEmail: 'buyer@test.com' },
      }),
    }) as unknown as typeof fetch;

    const response = await handler(buildRefundEvent(paymentSucceededBody()), {} as never);
    const body = JSON.parse(response?.body ?? '{}');

    expect(fetchRefundFromYooKassaApiMock).not.toHaveBeenCalled();
    expect(body.message).not.toContain('Refund webhook processed');
  });
});
