/**
 * Purchase ownership and revoke checks (account-owned library).
 */

import { query } from './db';
import { getViewerEmailLower, viewerPurchasedAlbum } from './entitlements';
import { activePurchaseFilter } from './purchase-schema';

export async function isAlbumOwnedByUser(
  userId: string,
  _emailLower: string | null,
  albumSlug: string
): Promise<boolean> {
  if (!albumSlug) {
    return false;
  }

  const revokedFilter = activePurchaseFilter();

  const result = await query<{ one: number }>(
    `SELECT 1 AS one
     FROM purchases
     WHERE album_id = $1
       AND user_id = $2::uuid
       ${revokedFilter}
     LIMIT 1`,
    [albumSlug, userId]
  );
  return result.rows.length > 0;
}

/**
 * Whether the checkout buyer already owns this album (server-side gate for create-payment).
 */
export async function buyerAlreadyOwnsAlbumForCheckout(
  buyerUserId: string | null,
  customerEmail: string,
  albumSlug: string
): Promise<boolean> {
  if (!albumSlug) {
    return false;
  }

  if (buyerUserId) {
    const accountEmailLower = await getViewerEmailLower(buyerUserId);
    if (await isAlbumOwnedByUser(buyerUserId, accountEmailLower, albumSlug)) {
      return true;
    }
  }

  const customerEmailLower = customerEmail.trim().toLowerCase();
  if (customerEmailLower && (await viewerPurchasedAlbum(albumSlug, customerEmailLower))) {
    return true;
  }

  return false;
}

export async function isPurchaseTokenActive(purchaseToken: string): Promise<{
  id: string;
  albumId: string;
} | null> {
  const revokedFilter = activePurchaseFilter();
  const result = await query<{ id: string; album_id: string }>(
    `SELECT id, album_id
     FROM purchases
     WHERE purchase_token = $1::uuid
       ${revokedFilter}
     LIMIT 1`,
    [purchaseToken]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return { id: row.id, albumId: row.album_id };
}

export async function revokePurchaseForUser(
  userId: string,
  _emailLower: string | null,
  purchaseId: string
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE purchases
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_by_user = $1::uuid,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2::uuid
       AND revoked_at IS NULL
       AND user_id = $1::uuid
     RETURNING id`,
    [userId, purchaseId]
  );
  return result.rows.length > 0;
}
