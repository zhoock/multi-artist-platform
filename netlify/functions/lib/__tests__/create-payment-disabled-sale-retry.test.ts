import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();
const resolveAlbumSlugMock = jest.fn();
const buyerAlreadyOwnsMock = jest.fn();
const resolveValidatedAlbumCheckoutPricingMock = jest.fn();
const getUserIdFromEventMock = jest.fn();
const syncPendingOrderAmountMock = jest.fn();
const invalidateStaleAlbumCheckoutPaymentMock = jest.fn();

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
  resolveValidatedAlbumCheckoutPricing: (...args: unknown[]) =>
    resolveValidatedAlbumCheckoutPricingMock(...args),
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

jest.mock('../album-checkout-resolve', () => ({
  resolveAlbumCheckoutOrder: jest.fn(),
  CheckoutAlreadyOwnedError: class CheckoutAlreadyOwnedError extends Error {},
  isAlbumFulfillmentHardError: () => false,
}));

jest.mock('../sync-pending-order-amount', () => ({
  syncPendingOrderAmount: (...args: unknown[]) => syncPendingOrderAmountMock(...args),
  albumCheckoutIdempotenceKey: (orderId: string, amount: number) =>
    `order-${orderId}-${amount.toFixed(2).replace('.', '-')}`,
}));

jest.mock('../album-checkout-payment', () => ({
  invalidateStaleAlbumCheckoutPayment: (...args: unknown[]) =>
    invalidateStaleAlbumCheckoutPaymentMock(...args),
  isReusableAlbumCheckoutPayment: (
    payment: { status: string; amount: { value: string } },
    amount: number
  ) =>
    (payment.status === 'pending' || payment.status === 'waiting_for_capture') &&
    payment.amount.value === amount.toFixed(2),
}));

jest.mock('../../payment-settings', () => ({
  getDecryptedSecretKey: jest.fn().mockResolvedValue({
    shopId: 'shop-id',
    secretKey: 'secret-key',
  }),
}));

import { handler as createPaymentHandler } from '../../create-payment';

const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALBUM_SLUG = 'sample-album';
const SELLER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAYMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CUSTOMER_EMAIL = 'buyer@example.com';
const ATTACKER_EMAIL = 'attacker@example.com';

const originalFetch = global.fetch;

function buildEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', referer: 'https://example.com/albums/demo' },
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/.netlify/functions/create-payment',
    rawUrl: '',
    queryStringParameters: null,
  } as HandlerEvent;
}

function pricing(amount: number) {
  return {
    ok: true,
    pricing: { amount, description: 'Album (download)' },
  };
}

function saleDenied(error = 'Album is not available for purchase') {
  return { ok: false, statusCode: 400, error };
}

function pendingOrderRow(customerEmail = CUSTOMER_EMAIL) {
  return {
    id: ORDER_ID,
    amount: '100.00',
    status: 'pending_payment',
    payment_id: PAYMENT_ID,
    customer_email: customerEmail,
  };
}

function setupBaseOrderMocks(customerEmail = CUSTOMER_EMAIL) {
  resolveAlbumSlugMock.mockImplementation(async (value: string) => value);
  getUserIdFromEventMock.mockReturnValue(null);
  buyerAlreadyOwnsMock.mockResolvedValue(false);
  syncPendingOrderAmountMock.mockResolvedValue(100);

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
    if (sql.includes('INSERT INTO payments') || sql.includes('UPDATE orders')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

function expectDeniedCheckout(body: Record<string, unknown>) {
  expect(body.success).toBe(false);
  expect(body.statusToken).toBeUndefined();
  expect(body.paymentId).toBeUndefined();
  expect(body.confirmationUrl).toBeUndefined();
  expect(body.fulfillmentRecovered).toBeUndefined();
}

describe('create-payment disabled sale retry (P1-3)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-create-payment-disabled-sale-secret-with-length';
    queryMock.mockReset();
    resolveAlbumSlugMock.mockReset();
    buyerAlreadyOwnsMock.mockReset();
    resolveValidatedAlbumCheckoutPricingMock.mockReset();
    getUserIdFromEventMock.mockReset();
    syncPendingOrderAmountMock.mockReset();
    invalidateStaleAlbumCheckoutPaymentMock.mockReset();
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    global.fetch = originalFetch;
  });

  it('denies retry when allowDownloadSale disabled after order creation', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(saleDenied());

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Album is not available for purchase');
    expectDeniedCheckout(body);
    expect(syncPendingOrderAmountMock).not.toHaveBeenCalled();
    expect(invalidateStaleAlbumCheckoutPaymentMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('denies retry when album unpublished after order creation', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(saleDenied());

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expectDeniedCheckout(body);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows retry when sale still enabled for legitimate order owner', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(pricing(100));
    invalidateStaleAlbumCheckoutPaymentMock.mockResolvedValue('reusable');

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/payments/${PAYMENT_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            id: PAYMENT_ID,
            status: 'pending',
            amount: { value: '100.00', currency: 'RUB' },
            confirmation: { confirmation_url: 'https://yookassa.test/pay' },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.statusToken).toBeTruthy();
    expect(body.paymentId).toBe(PAYMENT_ID);
    expect(resolveValidatedAlbumCheckoutPricingMock).toHaveBeenCalledWith(ALBUM_SLUG);
    expect(syncPendingOrderAmountMock).toHaveBeenCalledWith(ORDER_ID, 100);
  });

  it('charges current price when sale enabled and price changed (100 → 200)', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(pricing(200));
    syncPendingOrderAmountMock.mockResolvedValue(200);
    invalidateStaleAlbumCheckoutPaymentMock.mockResolvedValue('invalidated');

    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/payments/${PAYMENT_ID}`) && (!init || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            id: PAYMENT_ID,
            status: 'pending',
            amount: { value: '100.00', currency: 'RUB' },
            confirmation: { confirmation_url: 'https://yookassa.test/pay' },
          }),
        } as Response;
      }
      if (url.includes('/payments') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.amount.value).toBe('200.00');
        return {
          ok: true,
          json: async () => ({
            id: 'new-payment-id',
            status: 'pending',
            amount: body.amount,
            confirmation: { confirmation_url: 'https://yookassa.test/new-pay' },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.paymentId).toBe('new-payment-id');
    expect(syncPendingOrderAmountMock).toHaveBeenCalledWith(ORDER_ID, 200);
  });

  it('returns 403 for wrong customerEmail even when sale is enabled', async () => {
    setupBaseOrderMocks(CUSTOMER_EMAIL);
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(pricing(100));

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: ATTACKER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.error).toBe('Access denied');
    expectDeniedCheckout(body);
    expect(resolveValidatedAlbumCheckoutPricingMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('denies correct owner when sale disabled (ownership does not bypass sale)', async () => {
    setupBaseOrderMocks(CUSTOMER_EMAIL);
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(saleDenied());

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expectDeniedCheckout(body);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not return existing confirmation URL when sale disabled and stale payment exists', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(saleDenied());

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expectDeniedCheckout(body);
    expect(invalidateStaleAlbumCheckoutPaymentMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks full security scenario: valid orderId + email cannot pay after artist disables sale', async () => {
    setupBaseOrderMocks();
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(saleDenied());

    const response = await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Album is not available for purchase');
    expectDeniedCheckout(body);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
