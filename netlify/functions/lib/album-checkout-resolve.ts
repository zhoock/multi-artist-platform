/**
 * Album checkout resolution: recovery for paid orders without purchase, then pending reuse/create.
 * Serializes on the same advisory lock as pending-order idempotency.
 */

import type { PoolClient } from 'pg';

import { query, withTransaction } from './db';
import {
  AlbumFulfillmentError,
  findSucceededPaymentForOrder,
  fulfillPaidOrderPurchaseInTransaction,
  sendAlbumPurchaseConfirmationEmail,
} from './fulfill-album-purchase';
import {
  normalizeCheckoutCustomerEmail,
  pendingOrderAdvisoryLockKey,
  type FindOrCreatePendingOrderInput,
  type FindOrCreatePendingOrderResult,
} from './find-or-create-pending-order';
import {
  syncPendingOrderAmount,
  syncPendingOrderAmountInTransaction,
} from './sync-pending-order-amount';

export class CheckoutAlreadyOwnedError extends Error {
  constructor() {
    super('ALREADY_OWNED');
    this.name = 'CheckoutAlreadyOwnedError';
  }
}

export type ResolveAlbumCheckoutResult =
  | {
      kind: 'recovered';
      orderId: string;
      paymentId: string;
    }
  | ({
      kind: 'pending';
    } & FindOrCreatePendingOrderResult);

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

function rowToPendingResult(
  row: { id: string; amount: string | number; status: string },
  reusedExisting: boolean
): FindOrCreatePendingOrderResult {
  const orderAmount = parseFloat(String(row.amount));
  if (!Number.isFinite(orderAmount) || orderAmount < 0.01) {
    throw new Error('Order amount is invalid');
  }

  return {
    orderId: row.id,
    orderAmount,
    orderStatus: row.status,
    reusedExisting,
  };
}

async function hasActivePurchaseForBuyer(
  client: PoolClient,
  albumId: string,
  emailLower: string
): Promise<boolean> {
  const result = await client.query<{ one: number }>(
    `SELECT 1 AS one
     FROM purchases
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = $2
       AND revoked_at IS NULL
     LIMIT 1`,
    [albumId, emailLower]
  );
  return result.rows.length > 0;
}

async function selectPaidOrderWithoutPurchaseRow(
  client: PoolClient,
  albumId: string,
  emailLower: string,
  sellerUserId: string
) {
  return client.query<{ id: string }>(
    `SELECT o.id
     FROM orders o
     WHERE o.album_id = $1
       AND LOWER(TRIM(o.customer_email)) = $2
       AND o.user_id = $3::uuid
       AND o.status = 'paid'
       AND NOT EXISTS (
         SELECT 1
         FROM purchases p
         WHERE p.album_id = o.album_id
           AND LOWER(TRIM(p.customer_email)) = LOWER(TRIM(o.customer_email))
       )
     ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC, o.id DESC
     LIMIT 1
     FOR UPDATE`,
    [albumId, emailLower, sellerUserId]
  );
}

async function selectPendingOrderForBuyer(
  client: PoolClient,
  albumId: string,
  emailLower: string,
  sellerUserId: string
) {
  return client.query<{ id: string; amount: string | number; status: string }>(
    `SELECT id, amount, status
     FROM orders
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = $2
       AND user_id = $3::uuid
       AND status = 'pending_payment'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [albumId, emailLower, sellerUserId]
  );
}

async function resolveAlbumCheckoutInTransaction(
  client: PoolClient,
  input: FindOrCreatePendingOrderInput,
  emailLower: string
): Promise<ResolveAlbumCheckoutResult> {
  if (await hasActivePurchaseForBuyer(client, input.albumId, emailLower)) {
    throw new CheckoutAlreadyOwnedError();
  }

  const paidWithoutPurchase = await selectPaidOrderWithoutPurchaseRow(
    client,
    input.albumId,
    emailLower,
    input.sellerUserId
  );

  if (paidWithoutPurchase.rows.length > 0) {
    const orderId = paidWithoutPurchase.rows[0].id;
    const payment = await findSucceededPaymentForOrder(client, orderId);
    await fulfillPaidOrderPurchaseInTransaction(client, orderId);
    return {
      kind: 'recovered',
      orderId,
      paymentId: payment.provider_payment_id,
    };
  }

  const existingPending = await selectPendingOrderForBuyer(
    client,
    input.albumId,
    emailLower,
    input.sellerUserId
  );

  if (existingPending.rows.length > 0) {
    const existingRow = existingPending.rows[0];
    const syncedAmount = await syncPendingOrderAmountInTransaction(
      client,
      existingRow.id,
      input.amount
    );
    return {
      kind: 'pending',
      ...rowToPendingResult({ ...existingRow, amount: syncedAmount }, true),
    };
  }

  const inserted = await client.query<{ id: string; amount: string | number; status: string }>(
    `INSERT INTO orders (
       user_id, album_id, amount, currency, customer_email,
       buyer_display_name, customer_phone,
       status, payment_provider
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, amount, status`,
    [
      input.sellerUserId,
      input.albumId,
      input.amount,
      'RUB',
      input.customerEmail,
      input.buyerDisplayName,
      input.customerPhone,
      'pending_payment',
      'yookassa',
    ]
  );

  if (inserted.rows.length === 0) {
    throw new Error('Failed to create order');
  }

  return {
    kind: 'pending',
    ...rowToPendingResult(inserted.rows[0], false),
  };
}

/**
 * Resolves checkout under advisory lock: recovery → pending reuse → pending create.
 * Sends purchase email after commit when recovery succeeds.
 */
export async function resolveAlbumCheckoutOrder(
  input: FindOrCreatePendingOrderInput
): Promise<ResolveAlbumCheckoutResult> {
  const emailLower = normalizeCheckoutCustomerEmail(input.customerEmail);
  const lockKey = pendingOrderAdvisoryLockKey(input.albumId, input.customerEmail);

  try {
    const resolved = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [lockKey]);
      return resolveAlbumCheckoutInTransaction(client, input, emailLower);
    });

    if (resolved.kind === 'recovered') {
      const orderMeta = await clientQueryOrderMeta(resolved.orderId);
      if (orderMeta) {
        await sendAlbumPurchaseConfirmationEmail(
          resolved.orderId,
          resolved.paymentId,
          orderMeta.customer_email,
          orderMeta.album_id,
          orderMeta.buyer_display_name
        );
      }
    }

    return resolved;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const fallback = await resolvePendingFallback(input, emailLower);
      if (fallback) {
        return { kind: 'pending', ...fallback };
      }
    }
    throw error;
  }
}

async function clientQueryOrderMeta(orderId: string) {
  const result = await query<{
    album_id: string;
    customer_email: string;
    buyer_display_name: string | null;
  }>(
    `SELECT album_id, customer_email, buyer_display_name
     FROM orders
     WHERE id = $1`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

async function resolvePendingFallback(
  input: FindOrCreatePendingOrderInput,
  emailLower: string
): Promise<FindOrCreatePendingOrderResult | null> {
  const fallback = await query<{ id: string; amount: string | number; status: string }>(
    `SELECT id, amount, status
     FROM orders
     WHERE album_id = $1
       AND LOWER(TRIM(customer_email)) = $2
       AND user_id = $3::uuid
       AND status = 'pending_payment'
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.albumId, emailLower, input.sellerUserId]
  );

  if (fallback.rows.length === 0) {
    return null;
  }

  const row = fallback.rows[0];
  const syncedAmount = await syncPendingOrderAmount(row.id, input.amount);
  return rowToPendingResult({ ...row, amount: syncedAmount }, true);
}

export function isAlbumFulfillmentHardError(error: unknown): error is AlbumFulfillmentError {
  return error instanceof AlbumFulfillmentError;
}
