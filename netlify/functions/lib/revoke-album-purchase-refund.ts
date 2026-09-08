/**
 * System-level purchase revocation after a verified full refund.
 * Distinct from user-initiated revokePurchaseForUser (library removal).
 */

import { query } from './db';

export type RevokeAlbumPurchaseForRefundResult =
  | { outcome: 'revoked'; purchaseId: string }
  | { outcome: 'already_revoked'; purchaseId: string }
  | { outcome: 'no_purchase' };

/**
 * Revoke the purchase linked to a paid album order.
 * Idempotent: already-revoked purchases are a safe no-op.
 */
export async function revokeAlbumPurchaseForRefund(
  orderId: string
): Promise<RevokeAlbumPurchaseForRefundResult> {
  const existing = await query<{ id: string; revoked_at: Date | null }>(
    `SELECT id, revoked_at
     FROM purchases
     WHERE order_id = $1::uuid
     LIMIT 1`,
    [orderId]
  );

  const row = existing.rows[0];
  if (!row) {
    return { outcome: 'no_purchase' };
  }

  if (row.revoked_at) {
    return { outcome: 'already_revoked', purchaseId: row.id };
  }

  const revoked = await query<{ id: string }>(
    `UPDATE purchases
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_by_user = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND order_id = $2::uuid
       AND revoked_at IS NULL
     RETURNING id`,
    [row.id, orderId]
  );

  const updated = revoked.rows[0];
  if (!updated) {
    return { outcome: 'already_revoked', purchaseId: row.id };
  }

  return { outcome: 'revoked', purchaseId: updated.id };
}
