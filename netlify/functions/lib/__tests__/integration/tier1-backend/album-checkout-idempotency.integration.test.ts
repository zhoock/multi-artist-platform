/**
 * Album checkout double-payment protection — integration tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';

import { applyAlbumPaymentSuccess } from '../../../complete-album-payment';
import {
  resolveAlbumCheckoutOrder,
  CheckoutAlreadyOwnedError,
} from '../../../album-checkout-resolve';
import {
  applyAlbumPaymentSucceededFulfillment,
  recoverAlbumPurchaseForPaidOrder,
} from '../../../fulfill-album-purchase';
import {
  ALBUM_E2E_AMOUNT,
  ALBUM_E2E_ARTIST_ID,
  ALBUM_E2E_BUYER_EMAIL,
  ALBUM_E2E_SLUG,
  countActivePurchasesForBuyerAlbum,
  countPaidOrdersForBuyerAlbum,
  countPendingOrdersForBuyerAlbum,
  countPurchaseEmailReservations,
  countPurchasesForBuyerAlbum,
  deletePurchaseForBuyerAlbum,
  seedAlbumCheckoutUsers,
  seedAlbumOrderWithPayment,
  seedPurchasableAlbum,
  truncateAlbumCheckoutE2eTables,
} from '../../helpers/album-checkout-e2e-seed';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';

jest.mock('../../../email', () => ({
  sendPurchaseEmail: jest.fn(async () => ({ success: true })),
}));

import { sendPurchaseEmail } from '../../../email';

registerTier1BackendHooks();

const dbTest = isE2eDatabaseConfigured() ? test : test.skip;

const checkoutInput = {
  sellerUserId: ALBUM_E2E_ARTIST_ID,
  albumId: ALBUM_E2E_SLUG,
  customerEmail: ALBUM_E2E_BUYER_EMAIL,
  amount: ALBUM_E2E_AMOUNT,
  buyerDisplayName: 'E2E Buyer',
  customerPhone: null as string | null,
};

describe('Album checkout idempotency @tier1', () => {
  beforeEach(async () => {
    if (!isE2eDatabaseConfigured()) return;
    jest.mocked(sendPurchaseEmail).mockClear();
    await truncateAlbumCheckoutE2eTables();
    await seedAlbumCheckoutUsers();
    await seedPurchasableAlbum();
  });

  dbTest(
    'paid order + no purchase → repeat checkout recovers purchase without second order',
    async () => {
      const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({
        withPurchase: false,
        orderStatus: 'paid',
      });

      const resolved = await resolveAlbumCheckoutOrder(checkoutInput);

      expect(resolved.kind).toBe('recovered');
      if (resolved.kind !== 'recovered') return;

      expect(resolved.orderId).toBe(orderId);
      expect(resolved.paymentId).toBe(providerPaymentId);
      expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
      expect(await countPendingOrdersForBuyerAlbum()).toBe(0);
      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
      expect(jest.mocked(sendPurchaseEmail)).toHaveBeenCalledTimes(1);

      await expect(resolveAlbumCheckoutOrder(checkoutInput)).rejects.toBeInstanceOf(
        CheckoutAlreadyOwnedError
      );
      expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
    }
  );

  dbTest('two concurrent checkouts before payment → one pending order', async () => {
    const [first, second] = await Promise.all([
      resolveAlbumCheckoutOrder(checkoutInput),
      resolveAlbumCheckoutOrder(checkoutInput),
    ]);

    expect(first.kind).toBe('pending');
    expect(second.kind).toBe('pending');
    if (first.kind !== 'pending' || second.kind !== 'pending') return;

    expect(first.orderId).toBe(second.orderId);
    expect(await countPendingOrdersForBuyerAlbum()).toBe(1);
    expect(await countPaidOrdersForBuyerAlbum()).toBe(0);
  });

  dbTest(
    'webhook + poll simultaneously → one purchase and at most one email reservation',
    async () => {
      const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({
        withPurchase: false,
        orderStatus: 'pending_payment',
      });

      const payload = {
        orderId,
        providerPaymentId,
        paymentStatus: 'succeeded',
        amountValue: ALBUM_E2E_AMOUNT.toFixed(2),
        currency: 'RUB',
        albumKey: ALBUM_E2E_SLUG,
        customerEmail: ALBUM_E2E_BUYER_EMAIL,
      };

      await Promise.all([
        applyAlbumPaymentSucceededFulfillment(payload),
        applyAlbumPaymentSucceededFulfillment(payload),
      ]);

      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
      expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
      expect(await countPurchaseEmailReservations(orderId)).toBeLessThanOrEqual(1);
      expect(jest.mocked(sendPurchaseEmail).mock.calls.length).toBeLessThanOrEqual(2);
      const alreadySentCalls = jest
        .mocked(sendPurchaseEmail)
        .mock.results.filter(
          (result) =>
            result.type === 'return' && (result.value as Promise<{ alreadySent?: boolean }>) && true
        );
      void alreadySentCalls;
    }
  );

  dbTest(
    'fulfillment failure rolls back paid status; retry succeeds with one purchase',
    async () => {
      const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({
        withPurchase: false,
        orderStatus: 'pending_payment',
      });

      await expect(
        applyAlbumPaymentSucceededFulfillment({
          orderId,
          providerPaymentId,
          paymentStatus: 'succeeded',
          amountValue: ALBUM_E2E_AMOUNT.toFixed(2),
          currency: 'RUB',
          albumKey: 'nonexistent-album-slug',
          customerEmail: ALBUM_E2E_BUYER_EMAIL,
        })
      ).rejects.toThrow();

      const { query } = await import('../../../db');
      const orderAfterFailure = await query<{ status: string }>(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(orderAfterFailure.rows[0]?.status).toBe('pending_payment');
      expect(await countActivePurchasesForBuyerAlbum()).toBe(0);

      await applyAlbumPaymentSucceededFulfillment({
        orderId,
        providerPaymentId,
        paymentStatus: 'succeeded',
        amountValue: ALBUM_E2E_AMOUNT.toFixed(2),
        currency: 'RUB',
        albumKey: ALBUM_E2E_SLUG,
        customerEmail: ALBUM_E2E_BUYER_EMAIL,
      });

      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
      expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
    }
  );

  dbTest(
    'after successful payment, deleted purchase → repeat checkout recovers without new paid order',
    async () => {
      const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({
        withPurchase: true,
        orderStatus: 'paid',
      });

      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
      await deletePurchaseForBuyerAlbum();
      expect(await countPurchasesForBuyerAlbum()).toBe(0);

      const resolved = await resolveAlbumCheckoutOrder(checkoutInput);
      expect(resolved.kind).toBe('recovered');
      if (resolved.kind === 'recovered') {
        expect(resolved.orderId).toBe(orderId);
        expect(resolved.paymentId).toBe(providerPaymentId);
      }

      expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
      expect(await countPendingOrdersForBuyerAlbum()).toBe(0);
      expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
    }
  );

  dbTest('revoked purchase → new checkout allowed (pending order, not recovery)', async () => {
    await seedAlbumOrderWithPayment({
      withPurchase: true,
      purchaseRevoked: true,
      orderStatus: 'paid',
    });

    const resolved = await resolveAlbumCheckoutOrder(checkoutInput);
    expect(resolved.kind).toBe('pending');
    if (resolved.kind !== 'pending') return;

    expect(resolved.reusedExisting).toBe(false);
    expect(await countPendingOrdersForBuyerAlbum()).toBe(1);
    expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
  });

  dbTest('poll path applyAlbumPaymentSuccess is transactional and idempotent', async () => {
    const { orderId, providerPaymentId } = await seedAlbumOrderWithPayment({
      withPurchase: false,
      orderStatus: 'pending_payment',
    });

    const paymentStatus = {
      id: providerPaymentId,
      status: 'succeeded' as const,
      paid: true,
      amount: { value: ALBUM_E2E_AMOUNT.toFixed(2), currency: 'RUB' },
      metadata: {
        orderId,
        albumId: ALBUM_E2E_SLUG,
        customerEmail: ALBUM_E2E_BUYER_EMAIL,
      },
    };

    expect(await applyAlbumPaymentSuccess(paymentStatus)).toBe(true);
    expect(await applyAlbumPaymentSuccess(paymentStatus)).toBe(true);
    expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
    expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
  });

  dbTest('recoverAlbumPurchaseForPaidOrder is idempotent', async () => {
    const { orderId } = await seedAlbumOrderWithPayment({
      withPurchase: false,
      orderStatus: 'paid',
    });

    await recoverAlbumPurchaseForPaidOrder(orderId);
    await recoverAlbumPurchaseForPaidOrder(orderId);

    expect(await countActivePurchasesForBuyerAlbum()).toBe(1);
    expect(await countPaidOrdersForBuyerAlbum()).toBe(1);
  });
});
