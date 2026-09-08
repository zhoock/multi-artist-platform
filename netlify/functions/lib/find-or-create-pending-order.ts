/**
 * Server-side idempotency for album checkout: one pending order per buyer + album.
 *
 * Concurrent create-payment calls serialize on a transaction-scoped advisory lock,
 * then reuse an existing pending_payment row or insert a new one. A partial unique
 * index (migration 065) is a second line of defense if two transactions race past
 * the lock window.
 */

import type { PoolClient } from 'pg';
import { query, withTransaction } from './db';
import {
  syncPendingOrderAmount,
  syncPendingOrderAmountInTransaction,
} from './sync-pending-order-amount';

export function normalizeCheckoutCustomerEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether submitted checkout email may continue an existing order. */
export function orderCheckoutEmailMatches(
  orderCustomerEmail: string,
  submittedCustomerEmail: string
): boolean {
  return (
    normalizeCheckoutCustomerEmail(orderCustomerEmail) ===
    normalizeCheckoutCustomerEmail(submittedCustomerEmail)
  );
}

/** Stable key for pg_advisory_xact_lock(hashtext(...)). */
export function pendingOrderAdvisoryLockKey(albumId: string, customerEmail: string): string {
  return `pending_order:${albumId}:${normalizeCheckoutCustomerEmail(customerEmail)}`;
}

export type FindOrCreatePendingOrderInput = {
  sellerUserId: string;
  albumId: string;
  customerEmail: string;
  amount: number;
  buyerDisplayName: string | null;
  customerPhone: string | null;
};

export type FindOrCreatePendingOrderResult = {
  orderId: string;
  orderAmount: number;
  orderStatus: string;
  reusedExisting: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

function rowToResult(
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

async function loadPendingOrderFallback(
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
  return rowToResult({ ...row, amount: syncedAmount }, true);
}

/**
 * Returns an existing pending_payment order for the same album + buyer email,
 * or atomically creates one when none exists.
 */
export async function findOrCreatePendingAlbumOrder(
  input: FindOrCreatePendingOrderInput
): Promise<FindOrCreatePendingOrderResult> {
  const emailLower = normalizeCheckoutCustomerEmail(input.customerEmail);
  const lockKey = pendingOrderAdvisoryLockKey(input.albumId, input.customerEmail);

  try {
    return await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [lockKey]);

      const existing = await selectPendingOrderForBuyer(
        client,
        input.albumId,
        emailLower,
        input.sellerUserId
      );

      if (existing.rows.length > 0) {
        const existingRow = existing.rows[0];
        const syncedAmount = await syncPendingOrderAmountInTransaction(
          client,
          existingRow.id,
          input.amount
        );
        return rowToResult({ ...existingRow, amount: syncedAmount }, true);
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

      return rowToResult(inserted.rows[0], false);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const fallback = await loadPendingOrderFallback(input, emailLower);
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}
