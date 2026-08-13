import crypto from 'node:crypto';

import {
  attachDevSucceededSubscriptionCheckout,
  completeDevAlbumPayment,
} from '../complete-dev-payment';
import { devPaymentRawMarker } from '../dev-payment-mode';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

const { query } = jest.requireMock('../db') as { query: jest.Mock };

describe('complete-dev-payment', () => {
  const envKeys = ['DEV_PAYMENT_MODE', 'CONTEXT', 'NODE_ENV', 'NETLIFY_DEV'] as const;
  const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    query.mockReset();
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
    }
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('completeDevAlbumPayment persists succeeded payment and links order', async () => {
    query.mockResolvedValue({ rows: [] });

    const orderId = crypto.randomUUID();
    const { paymentId } = await completeDevAlbumPayment({ orderId, amount: 1 });

    expect(paymentId).toMatch(UUID_RE);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([orderId, paymentId, '1.00', JSON.stringify(devPaymentRawMarker())])
    );
    expect(query.mock.calls[1][1]).toEqual([paymentId, orderId]);
  });

  it('attachDevSucceededSubscriptionCheckout marks subscription payment succeeded', async () => {
    const subscriptionPaymentId = crypto.randomUUID();
    query.mockResolvedValue({ rows: [{ id: subscriptionPaymentId }] });

    const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });

    expect(paymentId).toMatch(UUID_RE);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      "COALESCE(raw_last_event, '{}'::jsonb) || $3::jsonb"
    );
    expect(query.mock.calls[0][1]).toEqual([
      subscriptionPaymentId,
      paymentId,
      JSON.stringify(devPaymentRawMarker()),
    ]);
  });

  it('throws when dev payment mode is disabled', async () => {
    process.env.DEV_PAYMENT_MODE = 'false';

    await expect(
      completeDevAlbumPayment({ orderId: crypto.randomUUID(), amount: 1 })
    ).rejects.toThrow(/dev payment mode is disabled/);
  });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
