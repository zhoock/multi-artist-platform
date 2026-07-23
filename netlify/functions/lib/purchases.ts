/**
 * Shared purchase library queries (account-owned model).
 */

import { query } from './db';
import { getViewerEmailLower } from './entitlements';
import {
  activePurchaseFilter,
  purchasesHasRevokedColumns,
  purchasesHasUserIdColumn,
} from './purchase-schema';
import {
  resolveAlbumByKey,
  resolveAlbumSlug,
  fetchTracksForResolvedAlbum,
} from './resolve-album-key';

export { revokePurchaseForUser } from './purchase-access';

export interface PurchaseRow {
  id: string;
  order_id: string;
  album_id: string;
  purchase_token: string;
  purchased_at: Date;
  download_count: number;
}

export interface PurchaseDto {
  id: string;
  orderId: string;
  albumId: string;
  albumUserId: string | null;
  artistDisplayName: string;
  album: string;
  cover: string | null;
  purchaseToken: string;
  purchasedAt: string;
  downloadCount: number;
  tracks: Array<{
    trackId: string;
    title: string;
  }>;
}

export async function purchasesTableExists(): Promise<boolean> {
  const tableCheckResult = await query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'purchases'
    ) as exists`
  );
  return tableCheckResult.rows[0]?.exists ?? false;
}

async function purchasesHasUserIdColumnLocal(): Promise<boolean> {
  return purchasesHasUserIdColumn();
}

async function mapPurchaseRows(rows: PurchaseRow[]): Promise<PurchaseDto[]> {
  if (rows.length === 0) {
    return [];
  }

  return Promise.all(
    rows.map(async (purchaseRow) => {
      const album = await resolveAlbumByKey(purchaseRow.album_id);

      if (!album) {
        console.warn('[purchases] Album not found for purchase:', {
          purchaseId: purchaseRow.id,
          albumKey: purchaseRow.album_id,
        });
        return {
          id: purchaseRow.id,
          orderId: purchaseRow.order_id,
          albumId: purchaseRow.album_id,
          albumUserId: null,
          artistDisplayName: 'Unknown',
          album: purchaseRow.album_id,
          cover: null,
          purchaseToken: purchaseRow.purchase_token,
          purchasedAt: purchaseRow.purchased_at.toISOString(),
          downloadCount: purchaseRow.download_count,
          tracks: [],
        };
      }

      const tracks = await fetchTracksForResolvedAlbum(album);

      return {
        id: purchaseRow.id,
        orderId: purchaseRow.order_id,
        albumId: album.albumSlug,
        albumUserId: album.userId,
        artistDisplayName: album.artistDisplayName,
        album: album.album,
        cover: album.cover || null,
        purchaseToken: purchaseRow.purchase_token,
        purchasedAt: purchaseRow.purchased_at.toISOString(),
        downloadCount: purchaseRow.download_count,
        tracks,
      };
    })
  );
}

/** Purchases owned by authenticated account (user_id, with email fallback for legacy rows). */
export async function fetchPurchasesForAccountUser(userId: string): Promise<PurchaseDto[]> {
  const accountEmailLower = await getViewerEmailLower(userId);
  const hasUserId = await purchasesHasUserIdColumnLocal();
  const revokedFilter = await activePurchaseFilter();

  let purchasesResult;

  if (hasUserId) {
    purchasesResult = await query<PurchaseRow>(
      `SELECT id, order_id, album_id, purchase_token, purchased_at, download_count
       FROM purchases
       WHERE (
         user_id = $1::uuid
         OR (
           user_id IS NULL
           AND $2::text IS NOT NULL
           AND LOWER(TRIM(customer_email)) = $2::text
         )
       )
       ${revokedFilter}
       ORDER BY purchased_at DESC`,
      [userId, accountEmailLower]
    );
  } else if (accountEmailLower) {
    purchasesResult = await query<PurchaseRow>(
      `SELECT id, order_id, album_id, purchase_token, purchased_at, download_count
       FROM purchases
       WHERE LOWER(TRIM(customer_email)) = $1
       ${revokedFilter}
       ORDER BY purchased_at DESC`,
      [accountEmailLower]
    );
  } else {
    return [];
  }

  return mapPurchaseRows(purchasesResult.rows);
}

/** Resolve user_id from checkout email when creating a purchase row. */
export async function resolveUserIdForCustomerEmail(customerEmail: string): Promise<string | null> {
  const hasUserId = await purchasesHasUserIdColumnLocal();
  if (!hasUserId) {
    return null;
  }

  const result = await query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
    [customerEmail]
  );
  return result.rows[0]?.id ?? null;
}

export async function upsertPurchaseRecord(
  orderId: string,
  customerEmail: string,
  albumId: string
): Promise<{ id: string; purchase_token: string } | null> {
  const albumSlug = await resolveAlbumSlug(albumId);
  if (!albumSlug) {
    console.error('[purchases] upsertPurchaseRecord: album not found for key:', albumId);
    return null;
  }

  const userId = await resolveUserIdForCustomerEmail(customerEmail);
  const hasUserId = await purchasesHasUserIdColumnLocal();
  const hasRevoked = await purchasesHasRevokedColumns();
  const restoreRevoked = hasRevoked ? ', revoked_at = NULL, revoked_by_user = NULL' : '';

  if (hasUserId) {
    const purchaseResult = await query<{ id: string; purchase_token: string }>(
      `INSERT INTO purchases (order_id, customer_email, album_id, user_id)
       VALUES ($1, $2, $3, $4::uuid)
       ON CONFLICT (customer_email, album_id)
       DO UPDATE SET
         order_id = EXCLUDED.order_id,
         user_id = COALESCE(purchases.user_id, EXCLUDED.user_id)${restoreRevoked},
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, purchase_token`,
      [orderId, customerEmail, albumSlug, userId]
    );
    return purchaseResult.rows[0] ?? null;
  }

  const purchaseResult = await query<{ id: string; purchase_token: string }>(
    `INSERT INTO purchases (order_id, customer_email, album_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_email, album_id)
     DO UPDATE SET order_id = EXCLUDED.order_id, updated_at = CURRENT_TIMESTAMP
     RETURNING id, purchase_token`,
    [orderId, customerEmail, albumSlug]
  );
  return purchaseResult.rows[0] ?? null;
}

/** Idempotent purchase upsert without RETURNING (email send path). */
export async function upsertPurchaseRecordSilent(
  orderId: string,
  customerEmail: string,
  albumId: string
): Promise<void> {
  const albumSlug = await resolveAlbumSlug(albumId);
  if (!albumSlug) {
    console.error('[purchases] upsertPurchaseRecordSilent: album not found for key:', albumId);
    return;
  }

  const userId = await resolveUserIdForCustomerEmail(customerEmail);
  const hasUserId = await purchasesHasUserIdColumnLocal();
  const hasRevoked = await purchasesHasRevokedColumns();
  const restoreRevoked = hasRevoked ? ', revoked_at = NULL, revoked_by_user = NULL' : '';

  if (hasUserId) {
    await query(
      `INSERT INTO purchases (order_id, customer_email, album_id, user_id)
       VALUES ($1, $2, $3, $4::uuid)
       ON CONFLICT (customer_email, album_id)
       DO UPDATE SET
         order_id = EXCLUDED.order_id,
         user_id = COALESCE(purchases.user_id, EXCLUDED.user_id)${restoreRevoked},
         updated_at = CURRENT_TIMESTAMP`,
      [orderId, customerEmail, albumSlug, userId]
    );
    return;
  }

  await query(
    `INSERT INTO purchases (order_id, customer_email, album_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_email, album_id)
     DO UPDATE SET order_id = EXCLUDED.order_id, updated_at = CURRENT_TIMESTAMP`,
    [orderId, customerEmail, albumSlug]
  );
}
