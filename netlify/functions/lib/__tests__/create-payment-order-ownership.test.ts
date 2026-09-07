import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();
const resolveAlbumSlugMock = jest.fn();
const buyerAlreadyOwnsMock = jest.fn();
const resolveAlbumPurchasePricingMock = jest.fn();
const getUserIdFromEventMock = jest.fn();

jest.mock('../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

jest.mock('../resolve-album-key', () => ({
  resolveAlbumSlug: (...args: unknown[]) => resolveAlbumSlugMock(...args),
}));

jest.mock('../purchase-access', () => ({
  buyerAlreadyOwnsAlbumForCheckout: (...args: unknown[]) => buyerAlreadyOwnsMock(...args),
}));

jest.mock('../resolve-album-purchase', () => ({
  resolveAlbumPurchasePricing: (...args: unknown[]) => resolveAlbumPurchasePricingMock(...args),
  resolveValidatedAlbumCheckoutPricing: jest.fn(),
}));

jest.mock('../api-helpers', () => ({
  getUserIdFromEvent: (...args: unknown[]) => getUserIdFromEventMock(...args),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: () => false,
  logDevPaymentAlbumCreate: jest.fn(),
  extractReturnToFromReturnUrl: jest.fn(),
}));

jest.mock('../complete-dev-payment', () => ({
  completeDevAlbumPayment: jest.fn(),
}));

jest.mock('../complete-album-payment', () => ({
  applyAlbumPaymentSuccess: jest.fn(),
}));

jest.mock('../email', () => ({
  sendPurchaseEmail: jest.fn(),
}));

import { handler as getOrderStatusHandler } from '../../get-order-status';
import { handler as getPaymentStatusHandler } from '../../get-payment-status';
import { handler as createPaymentHandler } from '../../create-payment';

const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALBUM_SLUG = 'sample-album';
const SELLER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAYMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const VICTIM_EMAIL = 'victim@example.com';
const ATTACKER_EMAIL = 'attacker@example.com';

function buildCreatePaymentEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/.netlify/functions/create-payment',
    rawUrl: '',
    queryStringParameters: null,
  } as HandlerEvent;
}

function pendingOrderRow(customerEmail = VICTIM_EMAIL) {
  return {
    id: ORDER_ID,
    amount: '500.00',
    status: 'pending_payment',
    payment_id: PAYMENT_ID,
    customer_email: customerEmail,
  };
}

function setupExistingPendingOrderMocks(customerEmail = VICTIM_EMAIL) {
  resolveAlbumSlugMock.mockImplementation(async (value: string) => value);
  getUserIdFromEventMock.mockReturnValue(null);
  buyerAlreadyOwnsMock.mockResolvedValue(false);
  resolveAlbumPurchasePricingMock.mockResolvedValue({
    ok: true,
    pricing: { amount: 500, description: 'Album' },
  });

  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id, album_id FROM orders')) {
      return { rows: [{ user_id: SELLER_ID, album_id: ALBUM_SLUG }] };
    }
    if (sql.includes('customer_email FROM orders')) {
      return { rows: [pendingOrderRow(customerEmail)] };
    }
    if (sql.includes('FROM payments') && sql.includes('pending')) {
      return {
        rows: [{ provider_payment_id: PAYMENT_ID, status: 'pending' }],
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('create-payment existing order ownership', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-create-payment-ownership-secret-with-length';
    queryMock.mockReset();
    resolveAlbumSlugMock.mockReset();
    buyerAlreadyOwnsMock.mockReset();
    resolveAlbumPurchasePricingMock.mockReset();
    getUserIdFromEventMock.mockReset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('denies existing pending order when customerEmail does not match', async () => {
    setupExistingPendingOrderMocks(VICTIM_EMAIL);

    const response = await createPaymentHandler(
      buildCreatePaymentEvent({
        albumId: ALBUM_SLUG,
        customerEmail: ATTACKER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Access denied');
    expect(body.statusToken).toBeUndefined();
    expect(body.paymentId).toBeUndefined();
    expect(body.confirmationUrl).toBeUndefined();
  });

  it('allows existing pending order reuse for matching customerEmail', async () => {
    setupExistingPendingOrderMocks(VICTIM_EMAIL);

    const response = await createPaymentHandler(
      buildCreatePaymentEvent({
        albumId: ALBUM_SLUG,
        customerEmail: VICTIM_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.statusToken).toBeTruthy();
    expect(body.statusTokenExpiresAt).toBeTruthy();
    expect(body.paymentId).toBe(PAYMENT_ID);
  });

  it('matches customer email case-insensitively for existing order', async () => {
    setupExistingPendingOrderMocks('Victim@Example.com');

    const response = await createPaymentHandler(
      buildCreatePaymentEvent({
        albumId: ALBUM_SLUG,
        customerEmail: 'victim@example.com',
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statusToken).toBeTruthy();
  });

  it('blocks full exploit chain: no statusToken then status endpoints stay closed', async () => {
    setupExistingPendingOrderMocks(VICTIM_EMAIL);

    const createResponse = await createPaymentHandler(
      buildCreatePaymentEvent({
        albumId: ALBUM_SLUG,
        customerEmail: ATTACKER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const createBody = JSON.parse(createResponse.body);
    expect(createBody.statusToken).toBeUndefined();

    const orderStatusResponse = await getOrderStatusHandler(
      {
        body: null,
        headers: {},
        httpMethod: 'GET',
        isBase64Encoded: false,
        path: '/.netlify/functions/get-order-status',
        rawUrl: '',
        queryStringParameters: { orderId: ORDER_ID },
      } as HandlerEvent,
      {} as never,
      {} as never
    );
    expect(orderStatusResponse.statusCode).toBe(403);

    const paymentStatusResponse = await getPaymentStatusHandler(
      {
        body: null,
        headers: {},
        httpMethod: 'GET',
        isBase64Encoded: false,
        path: '/.netlify/functions/get-payment-status',
        rawUrl: '',
        queryStringParameters: { orderId: ORDER_ID },
      } as HandlerEvent,
      {} as never,
      {} as never
    );
    expect(paymentStatusResponse.statusCode).toBe(403);
  });
});
