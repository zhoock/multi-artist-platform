import type { HandlerEvent } from '@netlify/functions';

const queryMock = jest.fn();
const resolveAlbumSlugMock = jest.fn();
const buyerAlreadyOwnsMock = jest.fn();
const resolveValidatedAlbumCheckoutPricingMock = jest.fn();
const getUserIdFromEventMock = jest.fn();
const syncPendingOrderAmountMock = jest.fn();
const invalidateStaleAlbumCheckoutPaymentMock = jest.fn();
const resolveAlbumCheckoutOrderMock = jest.fn();

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
  resolveAlbumCheckoutOrder: (...args: unknown[]) => resolveAlbumCheckoutOrderMock(...args),
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

function pendingOrderRow(storedAmount: string | number) {
  return {
    id: ORDER_ID,
    amount: storedAmount,
    status: 'pending_payment',
    payment_id: PAYMENT_ID,
    customer_email: CUSTOMER_EMAIL,
  };
}

function setupExistingOrderFlow(options: {
  storedOrderAmount: string | number;
  currentAlbumPrice: number;
  syncedAmount?: number;
  stalePaymentOutcome?: 'reusable' | 'invalidated' | 'unchanged';
  yookassaPaymentAmount?: string;
  yookassaCreateAmount?: string;
}) {
  const syncedAmount = options.syncedAmount ?? options.currentAlbumPrice;
  resolveAlbumSlugMock.mockImplementation(async (value: string) => value);
  getUserIdFromEventMock.mockReturnValue(null);
  buyerAlreadyOwnsMock.mockResolvedValue(false);
  resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(pricing(options.currentAlbumPrice));
  syncPendingOrderAmountMock.mockResolvedValue(syncedAmount);
  invalidateStaleAlbumCheckoutPaymentMock.mockResolvedValue(
    options.stalePaymentOutcome ?? 'invalidated'
  );

  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id, album_id FROM orders')) {
      return { rows: [{ user_id: SELLER_ID, album_id: ALBUM_SLUG }] };
    }
    if (sql.includes('customer_email FROM orders')) {
      return { rows: [pendingOrderRow(options.storedOrderAmount)] };
    }
    if (sql.includes('FROM payments') && sql.includes('pending')) {
      return {
        rows: [{ provider_payment_id: PAYMENT_ID, status: 'pending' }],
      };
    }
    if (sql.includes('INSERT INTO payments')) {
      return { rows: [] };
    }
    if (sql.includes('UPDATE orders') && sql.includes('payment_id')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  const yookassaPaymentAmount = options.yookassaPaymentAmount ?? syncedAmount.toFixed(2);
  const yookassaCreateAmount = options.yookassaCreateAmount ?? syncedAmount.toFixed(2);

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/payments/${PAYMENT_ID}`) && (!init || init.method === 'GET')) {
      return {
        ok: true,
        json: async () => ({
          id: PAYMENT_ID,
          status: 'pending',
          amount: { value: yookassaPaymentAmount, currency: 'RUB' },
          confirmation: { confirmation_url: 'https://yookassa.test/pay' },
        }),
      } as Response;
    }
    if (url.includes('/payments') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
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
    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
  }) as typeof fetch;

  return { syncedAmount, yookassaCreateAmount };
}

describe('create-payment stale pending order price', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-create-payment-stale-price-secret-with-length';
    queryMock.mockReset();
    resolveAlbumSlugMock.mockReset();
    buyerAlreadyOwnsMock.mockReset();
    resolveValidatedAlbumCheckoutPricingMock.mockReset();
    getUserIdFromEventMock.mockReset();
    syncPendingOrderAmountMock.mockReset();
    invalidateStaleAlbumCheckoutPaymentMock.mockReset();
    resolveAlbumCheckoutOrderMock.mockReset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    global.fetch = originalFetch;
  });

  it('syncs order to current album price when price increased (100 → 200)', async () => {
    setupExistingOrderFlow({ storedOrderAmount: '100.00', currentAlbumPrice: 200 });

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

    expect(syncPendingOrderAmountMock).toHaveBeenCalledWith(ORDER_ID, 200);
    expect(invalidateStaleAlbumCheckoutPaymentMock).toHaveBeenCalledWith(
      ORDER_ID,
      PAYMENT_ID,
      200,
      'shop-id',
      'secret-key'
    );
    expect(response.statusCode).toBe(200);
    expect(body.paymentId).toBe('new-payment-id');
  });

  it('syncs order when price decreased (200 → 100)', async () => {
    setupExistingOrderFlow({ storedOrderAmount: '200.00', currentAlbumPrice: 100 });

    await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
      }),
      {} as never,
      {} as never
    );

    expect(syncPendingOrderAmountMock).toHaveBeenCalledWith(ORDER_ID, 100);
    expect(invalidateStaleAlbumCheckoutPaymentMock).toHaveBeenCalledWith(
      ORDER_ID,
      PAYMENT_ID,
      100,
      'shop-id',
      'secret-key'
    );
  });

  it('reuses existing payment when price unchanged and amount matches', async () => {
    setupExistingOrderFlow({
      storedOrderAmount: '100.00',
      currentAlbumPrice: 100,
      stalePaymentOutcome: 'reusable',
      yookassaPaymentAmount: '100.00',
    });

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

    expect(body.paymentId).toBe(PAYMENT_ID);
    expect(body.message).toBe('Using existing pending payment');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/payments/${PAYMENT_ID}`),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('does not reuse stale YooKassa payment when order synced to higher price', async () => {
    setupExistingOrderFlow({
      storedOrderAmount: '100.00',
      currentAlbumPrice: 200,
      stalePaymentOutcome: 'invalidated',
      yookassaPaymentAmount: '100.00',
    });

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

    expect(body.paymentId).toBe('new-payment-id');
    expect(body.paymentId).not.toBe(PAYMENT_ID);
  });

  it('ignores client-controlled amount field in request body', async () => {
    setupExistingOrderFlow({ storedOrderAmount: '100.00', currentAlbumPrice: 200 });

    await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        orderId: ORDER_ID,
        amount: 1,
      }),
      {} as never,
      {} as never
    );

    expect(syncPendingOrderAmountMock).toHaveBeenCalledWith(ORDER_ID, 200);
    expect(resolveValidatedAlbumCheckoutPricingMock).toHaveBeenCalledWith(ALBUM_SLUG);
  });

  it('uses server pricing for new checkout without orderId', async () => {
    resolveAlbumSlugMock.mockImplementation(async (value: string) => value);
    getUserIdFromEventMock.mockReturnValue(null);
    buyerAlreadyOwnsMock.mockResolvedValue(false);
    resolveValidatedAlbumCheckoutPricingMock.mockResolvedValue(pricing(150));
    resolveAlbumCheckoutOrderMock.mockResolvedValue({
      kind: 'pending',
      orderId: ORDER_ID,
      orderAmount: 150,
      orderStatus: 'pending_payment',
      reusedExisting: true,
    });

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM albums')) {
        return { rows: [{ user_id: SELLER_ID }] };
      }
      if (sql.includes('FROM payments') && sql.includes('pending')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO payments') || sql.includes('UPDATE orders')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    global.fetch = jest.fn(async (_input, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.amount.value).toBe('150.00');
        return {
          ok: true,
          json: async () => ({
            id: 'fresh-payment',
            status: 'pending',
            amount: body.amount,
            confirmation: { confirmation_url: 'https://yookassa.test/fresh' },
          }),
        } as Response;
      }
      throw new Error('Unexpected fetch');
    }) as typeof fetch;

    await createPaymentHandler(
      buildEvent({
        albumId: ALBUM_SLUG,
        customerEmail: CUSTOMER_EMAIL,
        amount: 999999,
      }),
      {} as never,
      {} as never
    );

    expect(resolveValidatedAlbumCheckoutPricingMock).toHaveBeenCalledWith(ALBUM_SLUG);
    expect(resolveAlbumCheckoutOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150 })
    );
  });
});
