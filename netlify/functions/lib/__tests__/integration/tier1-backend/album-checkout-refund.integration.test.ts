/**
 * Album purchase refund revocation — integration tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import {
  ALBUM_E2E_AMOUNT,
  ALBUM_E2E_BUYER_EMAIL,
  ALBUM_E2E_BUYER_ID,
  ALBUM_E2E_SLUG,
  getPurchaseRevokedAt,
  getPurchaseToken,
  isPurchaseActiveForEmail,
  seedAlbumCheckoutUsers,
  seedAlbumOrderWithPayment,
  seedPurchasableAlbum,
  seedSecondBuyerAlbumPurchase,
  truncateAlbumCheckoutE2eTables,
} from '../../helpers/album-checkout-e2e-seed';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { isAlbumOwnedByUser, isPurchaseTokenActive } from '../../../purchase-access';

const fetchRefundFromYooKassaApiMock = jest.fn();
const getDecryptedSecretKeyMock = jest.fn();

jest.mock('../../../yookassa-webhook-verify', () => {
  const actual = jest.requireActual('../../../yookassa-webhook-verify') as Record<string, unknown>;
  return {
    ...actual,
    fetchRefundFromYooKassaApi: (...args: unknown[]) => fetchRefundFromYooKassaApiMock(...args),
    isNotificationIpAllowed: () => true,
  };
});

jest.mock('../../../../payment-settings', () => ({
  getDecryptedSecretKey: (...args: unknown[]) => getDecryptedSecretKeyMock(...args),
}));

jest.mock('../../../subscription-billing', () => ({
  getSubscriptionPaymentByProviderId: jest.fn(async () => null),
}));

import { handler as paymentWebhookHandler } from '../../../../payment-webhook';

registerTier1BackendHooks();

const dbTest = isE2eDatabaseConfigured() ? test : test.skip;

function buildRefundWebhookEvent(refundId: string, providerPaymentId: string): HandlerEvent {
  return {
    body: JSON.stringify({
      type: 'notification',
      event: 'refund.succeeded',
      object: {
        id: refundId,
        status: 'succeeded',
        payment_id: providerPaymentId,
        amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      },
    }),
    headers: { 'x-forwarded-for': '185.71.76.1' },
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/.netlify/functions/payment-webhook',
    rawUrl: '',
    queryStringParameters: {},
  } as HandlerEvent;
}

describe('Album purchase refund revocation @tier1', () => {
  beforeEach(async () => {
    if (!isE2eDatabaseConfigured()) return;
    process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK = 'true';
    fetchRefundFromYooKassaApiMock.mockReset();
    getDecryptedSecretKeyMock.mockReset();
    getDecryptedSecretKeyMock.mockResolvedValue({ shopId: 'shop-e2e', secretKey: 'secret-e2e' });
    await truncateAlbumCheckoutE2eTables();
    await seedAlbumCheckoutUsers();
    await seedPurchasableAlbum();
  });

  afterEach(() => {
    delete process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK;
  });

  dbTest('full refund webhook revokes purchase and denies access', async () => {
    const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({ withPurchase: true });
    const refundId = crypto.randomUUID();

    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: refundId,
        status: 'succeeded',
        payment_id: providerPaymentId,
        amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      },
    });

    const tokenBefore = await getPurchaseToken();
    expect(tokenBefore).toBeTruthy();
    expect(
      await isAlbumOwnedByUser(ALBUM_E2E_BUYER_ID, ALBUM_E2E_BUYER_EMAIL, ALBUM_E2E_SLUG)
    ).toBe(true);
    expect(await isPurchaseTokenActive(tokenBefore!)).not.toBeNull();

    const response = await paymentWebhookHandler(
      buildRefundWebhookEvent(refundId, providerPaymentId),
      {} as never
    );
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(true);
    expect(await getPurchaseRevokedAt()).not.toBeNull();
    expect(
      await isAlbumOwnedByUser(ALBUM_E2E_BUYER_ID, ALBUM_E2E_BUYER_EMAIL, ALBUM_E2E_SLUG)
    ).toBe(false);
    expect(await isPurchaseTokenActive(tokenBefore!)).toBeNull();
    void orderId;
  });

  dbTest('duplicate refund webhook is idempotent', async () => {
    const { providerPaymentId } = await seedAlbumOrderWithPayment({ withPurchase: true });
    const refundId = crypto.randomUUID();

    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: refundId,
        status: 'succeeded',
        payment_id: providerPaymentId,
        amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      },
    });

    const first = await paymentWebhookHandler(
      buildRefundWebhookEvent(refundId, providerPaymentId),
      {} as never
    );
    const firstRevokedAt = await getPurchaseRevokedAt();
    expect(JSON.parse(first.body ?? '{}').processed).toBe(true);
    expect(firstRevokedAt).not.toBeNull();

    const second = await paymentWebhookHandler(
      buildRefundWebhookEvent(refundId, providerPaymentId),
      {} as never
    );
    const secondBody = JSON.parse(second?.body ?? '{}');

    expect(second?.statusCode).toBe(200);
    expect(secondBody.duplicate).toBe(true);
    expect((await getPurchaseRevokedAt())?.toISOString()).toBe(firstRevokedAt?.toISOString());
  });

  dbTest('refund for order A does not revoke purchase for order B', async () => {
    const orderA = await seedAlbumOrderWithPayment({ withPurchase: true });
    const orderB = await seedSecondBuyerAlbumPurchase();

    const refundId = crypto.randomUUID();
    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: refundId,
        status: 'succeeded',
        payment_id: orderA.providerPaymentId,
        amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      },
    });

    await paymentWebhookHandler(
      buildRefundWebhookEvent(refundId, orderA.providerPaymentId),
      {} as never
    );

    expect(await getPurchaseRevokedAt()).not.toBeNull();
    expect(await isPurchaseActiveForEmail(ALBUM_E2E_BUYER_EMAIL)).toBe(false);
    expect(await isPurchaseActiveForEmail(orderB.buyerEmail)).toBe(true);
    expect(await isAlbumOwnedByUser(orderB.buyerId, orderB.buyerEmail, ALBUM_E2E_SLUG)).toBe(true);
  });

  dbTest('already revoked purchase + refund webhook stays safe no-op', async () => {
    const { providerPaymentId } = await seedAlbumOrderWithPayment({
      withPurchase: true,
      purchaseRevoked: true,
    });
    const refundId = crypto.randomUUID();

    fetchRefundFromYooKassaApiMock.mockResolvedValue({
      ok: true,
      refund: {
        id: refundId,
        status: 'succeeded',
        payment_id: providerPaymentId,
        amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      },
    });

    const response = await paymentWebhookHandler(
      buildRefundWebhookEvent(refundId, providerPaymentId),
      {} as never
    );
    const body = JSON.parse(response?.body ?? '{}');

    expect(response?.statusCode).toBe(200);
    expect(body.processed).toBe(true);
    expect(await getPurchaseRevokedAt()).not.toBeNull();
  });
});
