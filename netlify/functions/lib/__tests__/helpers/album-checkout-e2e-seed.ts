/**
 * Album checkout integration test seed helpers.
 */

import crypto from 'node:crypto';

import { query } from '../../db';

export const ALBUM_E2E_ARTIST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
export const ALBUM_E2E_BUYER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
export const ALBUM_E2E_SLUG = 'album-e2e-checkout';
export const ALBUM_E2E_BUYER_EMAIL = 'album-buyer@pr10-e2e.test';
export const ALBUM_E2E_AMOUNT = 499;

export async function truncateAlbumCheckoutE2eTables(): Promise<void> {
  await query('DELETE FROM webhook_events WHERE provider IN ($1, $2)', ['yookassa', 'internal']);
  await query('DELETE FROM purchases WHERE customer_email LIKE $1', ['%@pr10-e2e.test']);
  await query(
    'DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE $1)',
    ['%@pr10-e2e.test']
  );
  await query('DELETE FROM orders WHERE customer_email LIKE $1', ['%@pr10-e2e.test']);
  await query('DELETE FROM albums WHERE album_id = $1', [ALBUM_E2E_SLUG]);
  await query(`DELETE FROM users WHERE email LIKE '%@pr10-e2e.test'`);
}

export async function seedAlbumCheckoutUsers(): Promise<void> {
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug)
     VALUES ($1::uuid, $2, 'e2e-hash', 'Album E2E Artist', 'other', 'album-e2e-artist')
     ON CONFLICT (id) DO NOTHING`,
    [ALBUM_E2E_ARTIST_ID, 'album-artist@pr10-e2e.test']
  );
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug)
     VALUES ($1::uuid, $2, 'e2e-hash', 'Album E2E Buyer', 'other', 'album-e2e-buyer')
     ON CONFLICT (id) DO NOTHING`,
    [ALBUM_E2E_BUYER_ID, ALBUM_E2E_BUYER_EMAIL]
  );
}

export async function seedPurchasableAlbum(): Promise<{ albumDbId: string }> {
  const release = JSON.stringify({
    allowDownloadSale: 'yes',
    regularPrice: String(ALBUM_E2E_AMOUNT),
    currency: 'RUB',
  });

  const result = await query<{ id: string }>(
    `INSERT INTO albums (
       user_id, album_id, artist, album, lang, is_public, is_published, release
     ) VALUES ($1::uuid, $2, 'E2E Artist', 'E2E Album', 'en', true, true, $3::jsonb)
     RETURNING id`,
    [ALBUM_E2E_ARTIST_ID, ALBUM_E2E_SLUG, release]
  );

  const albumDbId = result.rows[0]?.id;
  if (!albumDbId) {
    throw new Error('seedPurchasableAlbum: INSERT returned no row');
  }

  return { albumDbId };
}

export type SeedPaidAlbumOrderParams = {
  orderId?: string;
  paymentId?: string;
  withPurchase?: boolean;
  purchaseRevoked?: boolean;
  orderStatus?: 'paid' | 'pending_payment';
};

export async function seedAlbumOrderWithPayment(
  params: SeedPaidAlbumOrderParams = {}
): Promise<{ orderId: string; paymentId: string; providerPaymentId: string }> {
  const orderId = params.orderId ?? crypto.randomUUID();
  const paymentRowId = params.paymentId ?? crypto.randomUUID();
  const providerPaymentId = crypto.randomUUID();
  const orderStatus = params.orderStatus ?? 'paid';

  const paidAt = orderStatus === 'paid' ? new Date() : null;

  await query(
    `INSERT INTO orders (
       id, user_id, album_id, amount, currency, customer_email,
       buyer_display_name, status, payment_provider, payment_id, paid_at
     ) VALUES (
       $1, $2::uuid, $3, $4, 'RUB', $5,
       'E2E Buyer', $6::text, 'yookassa', $7, $8
     )`,
    [
      orderId,
      ALBUM_E2E_ARTIST_ID,
      ALBUM_E2E_SLUG,
      ALBUM_E2E_AMOUNT,
      ALBUM_E2E_BUYER_EMAIL,
      orderStatus,
      orderStatus === 'paid' ? providerPaymentId : null,
      paidAt,
    ]
  );

  await query(
    `INSERT INTO payments (
       id, order_id, provider, provider_payment_id, status, amount, currency
     ) VALUES ($1, $2, 'yookassa', $3, $4, $5, 'RUB')`,
    [
      paymentRowId,
      orderId,
      providerPaymentId,
      orderStatus === 'paid' ? 'succeeded' : 'pending',
      ALBUM_E2E_AMOUNT.toFixed(2),
    ]
  );

  if (params.withPurchase) {
    await query(
      `INSERT INTO purchases (order_id, customer_email, album_id, user_id, revoked_at, revoked_by_user)
       VALUES ($1, $2, $3, $4::uuid, $5, $6)`,
      [
        orderId,
        ALBUM_E2E_BUYER_EMAIL,
        ALBUM_E2E_SLUG,
        ALBUM_E2E_BUYER_ID,
        params.purchaseRevoked ? new Date() : null,
        params.purchaseRevoked ? ALBUM_E2E_BUYER_ID : null,
      ]
    );
  }

  return { orderId, paymentId: paymentRowId, providerPaymentId };
}

export async function countPaidOrdersForBuyerAlbum(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM orders
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))
       AND status = 'paid'`,
    [ALBUM_E2E_SLUG, ALBUM_E2E_BUYER_EMAIL]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function countPurchasesForBuyerAlbum(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM purchases
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))`,
    [ALBUM_E2E_SLUG, ALBUM_E2E_BUYER_EMAIL]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function countPendingOrdersForBuyerAlbum(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM orders
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))
       AND status = 'pending_payment'`,
    [ALBUM_E2E_SLUG, ALBUM_E2E_BUYER_EMAIL]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function countActivePurchasesForBuyerAlbum(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM purchases
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))
       AND revoked_at IS NULL`,
    [ALBUM_E2E_SLUG, ALBUM_E2E_BUYER_EMAIL]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function deletePurchaseForBuyerAlbum(): Promise<void> {
  await query(
    `DELETE FROM purchases
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))`,
    [ALBUM_E2E_SLUG, ALBUM_E2E_BUYER_EMAIL]
  );
}

export async function countPurchaseEmailReservations(orderId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM webhook_events
     WHERE provider = 'internal'
       AND event_id = $1`,
    [`purchase-email:${orderId}`]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}
