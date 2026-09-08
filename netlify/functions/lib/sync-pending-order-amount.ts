/**
 * Keeps pending album order amount aligned with current server-side album price.
 */

import type { PoolClient } from 'pg';

import { query } from './db';

export function orderAmountsEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.001;
}

export function formatOrderAmountForIdempotence(amount: number): string {
  return amount.toFixed(2).replace('.', '-');
}

export function albumCheckoutIdempotenceKey(orderId: string, amount: number): string {
  return `order-${orderId}-${formatOrderAmountForIdempotence(amount)}`;
}

/**
 * Updates pending order amount when it differs from the current server-side price.
 * Returns the amount that must be used for payment creation.
 */
export async function syncPendingOrderAmount(
  orderId: string,
  currentAmount: number
): Promise<number> {
  if (!Number.isFinite(currentAmount) || currentAmount < 0.01) {
    throw new Error('Current album price is invalid');
  }

  const result = await query<{ amount: string | number }>(
    `UPDATE orders
     SET amount = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND status = 'pending_payment'
     RETURNING amount`,
    [currentAmount, orderId]
  );

  if (result.rows.length === 0) {
    throw new Error('Pending order not found for amount sync');
  }

  const syncedAmount = parseFloat(String(result.rows[0].amount));
  if (!Number.isFinite(syncedAmount) || syncedAmount < 0.01) {
    throw new Error('Order amount is invalid after sync');
  }

  return syncedAmount;
}

/** Same as syncPendingOrderAmount but uses an open transaction client (FOR UPDATE already held). */
export async function syncPendingOrderAmountInTransaction(
  client: PoolClient,
  orderId: string,
  currentAmount: number
): Promise<number> {
  if (!Number.isFinite(currentAmount) || currentAmount < 0.01) {
    throw new Error('Current album price is invalid');
  }

  const result = await client.query<{ amount: string | number }>(
    `UPDATE orders
     SET amount = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND status = 'pending_payment'
     RETURNING amount`,
    [currentAmount, orderId]
  );

  if (result.rows.length === 0) {
    throw new Error('Pending order not found for amount sync');
  }

  const syncedAmount = parseFloat(String(result.rows[0].amount));
  if (!Number.isFinite(syncedAmount) || syncedAmount < 0.01) {
    throw new Error('Order amount is invalid after sync');
  }

  return syncedAmount;
}
