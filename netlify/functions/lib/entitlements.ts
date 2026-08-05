/**
 * Единый слой проверки прав на контент артиста.
 *
 * Покупка альбома — владение релизом и скачивание его треков (без premium).
 * Premium — subscribers_only (треки/статьи), sync lyrics и т.д.
 *
 * Формула доступа:
 *   subscription.active && artist in user_archive && artist.is_active
 * (владелец артиста и dev mock — override).
 */

import { query } from './db';
import { activePurchaseFilter } from './purchase-schema';
import { userHasActiveArtistInArchive } from './archive';
import { hasPremiumAccess } from './subscription-access';
import { getViewerSubscription } from './subscriptions';

export {
  getViewerSubscription,
  isSubscriptionActive,
  viewerHasActiveSubscription,
} from './subscriptions';
export type { Subscription, SubscriptionStatus } from './subscriptions';
export {
  addArtistToArchive,
  activateArtistsInArchive,
  countUserArchiveSlots,
  deactivateAllArchiveArtists,
  deactivateExcessArchiveArtists,
  extendActiveArchiveLockedUntil,
  getArchiveStatusForArtist,
  getUserArchiveArtists,
  removeArtistFromArchive,
  userHasArtistInArchive,
  userHasActiveArtistInArchive,
  isArchiveArtistLocked,
  canRemoveArchiveArtist,
  ArchiveSlotsLimitError,
  ArchiveSubscriptionRequiredError,
  ArchiveActivationLimitError,
  ArchiveArtistLockedError,
} from './archive';
export type { ArchiveStatus, UserArchiveEntry } from './archive';

export async function getViewerEmailLower(userId: string): Promise<string | null> {
  const r = await query<{ email: string }>(`SELECT email FROM users WHERE id = $1::uuid LIMIT 1`, [
    userId,
  ]);
  const e = r.rows[0]?.email?.trim().toLowerCase();
  return e || null;
}

export async function viewerPurchasedAlbum(
  albumSlug: string,
  emailLower: string | null
): Promise<boolean> {
  if (!emailLower || !albumSlug) return false;
  const revokedFilter = await activePurchaseFilter();
  const r = await query<{ one: number }>(
    `SELECT 1 AS one FROM purchases WHERE album_id = $1 AND LOWER(TRIM(customer_email)) = $2 ${revokedFilter} LIMIT 1`,
    [albumSlug, emailLower]
  );
  return r.rows.length > 0;
}

export async function getArtistUserIdForAlbumSlug(albumSlug: string): Promise<string | null> {
  const r = await query<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM albums WHERE album_id = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [albumSlug]
  );
  return r.rows[0]?.user_id ?? null;
}

/**
 * Premium-доступ к контенту артиста.
 *
 * Владелец артиста всегда имеет доступ.
 * Dev mock: MOCK_ACTIVE_SUBSCRIPTION_USER_IDS, MOCK_SUBSCRIPTION_USER_ARTIST_PAIRS.
 */
export async function viewerHasPremiumAccessToArtist(
  viewerUserId: string | null,
  artistUserId: string | null | undefined
): Promise<boolean> {
  const artistId = artistUserId?.trim();
  if (!viewerUserId || !artistId) return false;
  if (viewerUserId === artistId) return true;

  if (mockActiveSubscriptionForArtist(viewerUserId, artistId)) {
    return true;
  }

  const [hasSubscription, activeInArchive] = await Promise.all([
    getViewerSubscription(viewerUserId).then((sub) => hasPremiumAccess(sub)),
    userHasActiveArtistInArchive(viewerUserId, artistId),
  ]);

  return hasSubscription && activeInArchive;
}

function mockActiveSubscriptionForArtist(viewerUserId: string, artistOwnerUserId: string): boolean {
  const envAll = process.env.MOCK_ACTIVE_SUBSCRIPTION_USER_IDS?.trim();
  if (envAll) {
    const set = new Set(
      envAll
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (set.has(viewerUserId)) return true;
  }
  const pairsRaw = process.env.MOCK_SUBSCRIPTION_USER_ARTIST_PAIRS?.trim();
  if (pairsRaw) {
    const needle = `${viewerUserId}:${artistOwnerUserId}`;
    for (const p of pairsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (p === needle) return true;
    }
  }
  return false;
}
