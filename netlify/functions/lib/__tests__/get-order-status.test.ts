import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();

jest.mock('../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { createCheckoutStatusToken } from '../checkout-status-token';
import { handler } from '../../get-order-status';

const ORDER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildEvent(query: Record<string, string | undefined>): HandlerEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/.netlify/functions/get-order-status',
    rawUrl: '',
    queryStringParameters: query,
  } as HandlerEvent;
}

function tokenQuery(orderId: string) {
  const { token, expiresAt } = createCheckoutStatusToken(orderId);
  return {
    orderId,
    statusToken: token,
    statusTokenExpiresAt: String(expiresAt),
  };
}

describe('get-order-status authorization', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-get-order-status-secret-with-enough-length';
    queryMock.mockReset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('returns order data for valid checkout token (guest checkout)', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: ORDER_A,
          status: 'paid',
          amount: '500.00',
          currency: 'RUB',
          customer_email: 'buyer@example.com',
          paid_at: '2026-01-01T00:00:00.000Z',
          payment_id: 'pay-1',
        },
      ],
    });

    const response = await handler(buildEvent(tokenQuery(ORDER_A)), {} as never, {} as never);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.order.customerEmail).toBe('buyer@example.com');
    expect(body.order.amount).toBe(500);
  });

  it('rejects missing authorization token', async () => {
    const response = await handler(buildEvent({ orderId: ORDER_A }), {} as never, {} as never);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Access denied');
    expect(body.customerEmail).toBeUndefined();
    expect(body.order).toBeUndefined();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects random token', async () => {
    const response = await handler(
      buildEvent({
        orderId: ORDER_A,
        statusToken: 'random-token',
        statusTokenExpiresAt: String(Date.now() + 60_000),
      }),
      {} as never,
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects valid token for order A with orderId B', async () => {
    const queryForA = tokenQuery(ORDER_A);
    const response = await handler(
      buildEvent({ ...queryForA, orderId: ORDER_B }),
      {} as never,
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not expose order B when querying with order A token against order B', async () => {
    const queryForA = tokenQuery(ORDER_A);
    const response = await handler(
      buildEvent({ ...queryForA, orderId: ORDER_B }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.customerEmail).toBeUndefined();
    expect(body.order).toBeUndefined();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('authenticated checkout still requires checkout status token', async () => {
    const response = await handler(
      buildEvent({
        orderId: ORDER_A,
      }),
      {} as never,
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
