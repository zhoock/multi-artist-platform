import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();
const applyAlbumPaymentSuccessMock = jest.fn();
const resolveAlbumByKeyMock = jest.fn();

jest.mock('../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

jest.mock('../complete-album-payment', () => ({
  applyAlbumPaymentSuccess: (...args: unknown[]) => applyAlbumPaymentSuccessMock(...args),
}));

jest.mock('../resolve-album-key', () => ({
  resolveAlbumByKey: (...args: unknown[]) => resolveAlbumByKeyMock(...args),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: () => false,
  isDevMarkedPayment: () => false,
  logDevPaymentAlbumStatus: jest.fn(),
}));

jest.mock('../../payment-settings', () => ({
  getDecryptedSecretKey: jest.fn().mockResolvedValue({ shopId: 'shop-1', secretKey: 'secret-1' }),
}));

import { createCheckoutStatusToken } from '../checkout-status-token';
import { handler } from '../../get-payment-status';

const ORDER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAYMENT_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildEvent(query: Record<string, string | undefined>): HandlerEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/.netlify/functions/get-payment-status',
    rawUrl: '',
    queryStringParameters: query,
  } as HandlerEvent;
}

function tokenQuery(orderId: string, extra: Record<string, string> = {}) {
  const { token, expiresAt } = createCheckoutStatusToken(orderId);
  return {
    orderId,
    statusToken: token,
    statusTokenExpiresAt: String(expiresAt),
    ...extra,
  };
}

describe('get-payment-status authorization', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-get-payment-status-secret-with-enough-length';
    queryMock.mockReset();
    applyAlbumPaymentSuccessMock.mockReset();
    resolveAlbumByKeyMock.mockReset();
    applyAlbumPaymentSuccessMock.mockResolvedValue(true);
    resolveAlbumByKeyMock.mockResolvedValue(null);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: PAYMENT_A,
        status: 'succeeded',
        paid: true,
        amount: { value: '500.00', currency: 'RUB' },
        metadata: { orderId: ORDER_A, customerEmail: 'buyer@example.com' },
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    jest.restoreAllMocks();
  });

  function mockAuthorizedOrderLookup() {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT payment_id FROM orders')) {
        return { rows: [{ payment_id: PAYMENT_A }] };
      }
      if (sql.includes('SELECT user_id FROM orders')) {
        return { rows: [{ user_id: 'seller-1' }] };
      }
      if (sql.includes('SELECT album_id FROM orders')) {
        return { rows: [{ album_id: 'album-slug' }] };
      }
      return { rows: [] };
    });
  }

  it('returns payment status for legitimate checkout polling', async () => {
    mockAuthorizedOrderLookup();

    const response = await handler(buildEvent(tokenQuery(ORDER_A)), {} as never, {} as never);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.payment.status).toBe('succeeded');
    expect(applyAlbumPaymentSuccessMock).toHaveBeenCalled();
  });

  it('rejects missing authorization token without fulfillment', async () => {
    const response = await handler(buildEvent({ orderId: ORDER_A }), {} as never, {} as never);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.success).toBe(false);
    expect(body.payment).toBeUndefined();
    expect(applyAlbumPaymentSuccessMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects forged token without fulfillment', async () => {
    const response = await handler(
      buildEvent({
        orderId: ORDER_A,
        statusToken: 'forged',
        statusTokenExpiresAt: String(Date.now() + 60_000),
      }),
      {} as never,
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(applyAlbumPaymentSuccessMock).not.toHaveBeenCalled();
  });

  it('rejects token for order A with orderId B without fulfillment', async () => {
    const queryForA = tokenQuery(ORDER_A);
    const response = await handler(
      buildEvent({ ...queryForA, orderId: ORDER_B }),
      {} as never,
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(applyAlbumPaymentSuccessMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not call fulfillment for unauthorized succeeded payment lookup', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT payment_id FROM orders')) {
        return { rows: [{ payment_id: PAYMENT_A }] };
      }
      return { rows: [] };
    });

    const response = await handler(buildEvent({ orderId: ORDER_A }), {} as never, {} as never);

    expect(response.statusCode).toBe(403);
    expect(applyAlbumPaymentSuccessMock).not.toHaveBeenCalled();
  });

  it('authorized request preserves idempotent fulfillment behavior', async () => {
    mockAuthorizedOrderLookup();
    applyAlbumPaymentSuccessMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const eventQuery = tokenQuery(ORDER_A);
    await handler(buildEvent(eventQuery), {} as never, {} as never);
    await handler(buildEvent(eventQuery), {} as never, {} as never);

    expect(applyAlbumPaymentSuccessMock).toHaveBeenCalledTimes(2);
  });

  it('guest checkout polling includes token in query', async () => {
    mockAuthorizedOrderLookup();

    const queryParams = tokenQuery(ORDER_A);
    expect(queryParams.statusToken).toBeTruthy();
    expect(queryParams.statusTokenExpiresAt).toBeTruthy();

    const response = await handler(buildEvent(queryParams), {} as never, {} as never);
    expect(response.statusCode).toBe(200);
  });

  it('unauthorized response does not leak payment metadata', async () => {
    const response = await handler(buildEvent({ orderId: ORDER_A }), {} as never, {} as never);
    const body = JSON.parse(response.body);

    expect(body.payment).toBeUndefined();
    expect(body.album).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/customerEmail|amount|paymentId|metadata/i);
  });
});
