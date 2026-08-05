/**
 * Artist archive: collection membership and per-artist activation.
 * Inactive rows persist as history; premium access requires is_active = true.
 */

import { isMissingRelationError, query } from './db';
import { hasPremiumAccess } from './subscription-access';
import { SUBSCRIPTION_SLOTS_LIMIT_FALLBACK } from './subscription-billing';
import { buildBillingSnapshot, type BillingSnapshot } from './subscription-billing-snapshot';
import { getViewerSubscription } from './subscriptions';

export interface UserArchiveEntry {
  id: string;
  userId: string;
  artistUserId: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  lockedUntil: Date | null;
}

export interface ArchiveStatus {
  isPremium: boolean;
  artistInArchive: boolean;
  artistActiveInArchive: boolean;
  slotsUsed: number;
  slotsLimit: number;
}

interface UserArchiveRow {
  id: string;
  user_id: string;
  artist_user_id: string;
  created_at: Date;
  updated_at: Date;
  is_active?: boolean;
  locked_until?: Date | null;
}

export class ArchiveSlotsLimitError extends Error {
  readonly code = 'ARCHIVE_SLOTS_LIMIT';

  constructor(
    public readonly slotsUsed: number,
    public readonly slotsLimit: number
  ) {
    super(`Collection slots limit reached (${slotsUsed}/${slotsLimit})`);
    this.name = 'ArchiveSlotsLimitError';
  }
}

export class ArchiveSubscriptionRequiredError extends Error {
  readonly code = 'ARCHIVE_SUBSCRIPTION_REQUIRED';

  constructor(message = 'Active subscription required for collection changes') {
    super(message);
    this.name = 'ArchiveSubscriptionRequiredError';
  }
}

export class ArchiveActivationLimitError extends Error {
  readonly code = 'ARCHIVE_ACTIVATION_LIMIT';

  constructor(
    public readonly availableSlots: number,
    public readonly requested: number
  ) {
    super(`Can activate up to ${availableSlots} artist(s)`);
    this.name = 'ArchiveActivationLimitError';
  }
}

export class ArchiveArtistLockedError extends Error {
  readonly code = 'ARCHIVE_ARTIST_LOCKED';

  constructor(
    public readonly artistUserId: string,
    public readonly lockedUntil: Date
  ) {
    super('Artist is locked until the end of the current billing period');
    this.name = 'ArchiveArtistLockedError';
  }
}

export function isArchiveArtistLocked(
  lockedUntil: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lockedUntil) return false;
  const ts = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return false;
  return ts.getTime() > now.getTime();
}

export function canRemoveArchiveArtist(
  lockedUntil: Date | null | undefined,
  hasActiveSubscription: boolean,
  isActive: boolean,
  now: Date = new Date()
): boolean {
  if (!isActive) return true;
  if (!hasActiveSubscription) return false;
  return !isArchiveArtistLocked(lockedUntil, now);
}

function mapUserArchiveRow(row: UserArchiveRow): UserArchiveEntry {
  return {
    id: row.id,
    userId: row.user_id,
    artistUserId: row.artist_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active === true,
    lockedUntil: row.locked_until ?? null,
  };
}

function toLockedUntilIso(lockedUntilDate: Date | null | undefined): string | null {
  if (!lockedUntilDate) return null;
  if (lockedUntilDate instanceof Date) {
    return lockedUntilDate.toISOString();
  }
  const parsed = new Date(lockedUntilDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function getUserArchiveArtists(userId: string): Promise<string[]> {
  const r = await query<{ artist_user_id: string }>(
    `SELECT artist_user_id
     FROM user_archive
     WHERE user_id = $1::uuid AND is_active = true
     ORDER BY created_at ASC`,
    [userId]
  );
  return r.rows.map((row) => row.artist_user_id);
}

export async function countUserArchiveSlots(userId: string): Promise<number> {
  const r = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM user_archive
     WHERE user_id = $1::uuid AND is_active = true`,
    [userId]
  );
  return Number.parseInt(r.rows[0]?.count ?? '0', 10) || 0;
}

export async function countInactiveArchiveArtists(userId: string): Promise<number> {
  const r = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM user_archive
     WHERE user_id = $1::uuid AND is_active = false`,
    [userId]
  );
  return Number.parseInt(r.rows[0]?.count ?? '0', 10) || 0;
}

export async function userHasArtistInArchive(
  userId: string,
  artistUserId: string
): Promise<boolean> {
  if (!userId?.trim() || !artistUserId?.trim()) return false;

  try {
    const r = await query<{ one: number }>(
      `SELECT 1 AS one
       FROM user_archive
       WHERE user_id = $1::uuid AND artist_user_id = $2::uuid
       LIMIT 1`,
      [userId, artistUserId]
    );
    return r.rows.length > 0;
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[archive] user_archive table missing — treating as not in archive');
      return false;
    }
    throw error;
  }
}

export async function userHasActiveArtistInArchive(
  userId: string,
  artistUserId: string
): Promise<boolean> {
  if (!userId?.trim() || !artistUserId?.trim()) return false;

  try {
    const r = await query<{ one: number }>(
      `SELECT 1 AS one
       FROM user_archive
       WHERE user_id = $1::uuid AND artist_user_id = $2::uuid AND is_active = true
       LIMIT 1`,
      [userId, artistUserId]
    );
    return r.rows.length > 0;
  } catch (error) {
    if (isMissingRelationError(error)) return false;
    throw error;
  }
}

export async function deactivateAllArchiveArtists(userId: string): Promise<number> {
  try {
    const r = await query(
      `UPDATE user_archive
       SET is_active = false,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid`,
      [userId]
    );
    return r.rowCount ?? 0;
  } catch (error) {
    if (isMissingRelationError(error)) return 0;
    throw error;
  }
}

/**
 * Deactivates active archive artists above slotsLimit (PR-7 renewal downgrade apply).
 * Order: last added first — locked_until DESC NULLS LAST, then created_at DESC.
 * Idempotent: second call with same limit deactivates 0 rows.
 */
export async function deactivateExcessArchiveArtists(
  userId: string,
  slotsLimit: number
): Promise<number> {
  if (slotsLimit < 0) return 0;

  try {
    const r = await query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  ORDER BY locked_until DESC NULLS LAST, created_at DESC
                ) AS rn
         FROM user_archive
         WHERE user_id = $1::uuid AND is_active = true
       ),
       to_deactivate AS (
         SELECT id FROM ranked WHERE rn > $2::int
       )
       UPDATE user_archive ua
       SET is_active = false,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       FROM to_deactivate td
       WHERE ua.id = td.id`,
      [userId, slotsLimit]
    );
    return r.rowCount ?? 0;
  } catch (error) {
    if (isMissingRelationError(error)) return 0;
    throw error;
  }
}

/** Extends locked_until for all active archive artists after a successful renewal. */
export async function extendActiveArchiveLockedUntil(
  userId: string,
  lockedUntil: Date
): Promise<number> {
  try {
    const r = await query(
      `UPDATE user_archive
       SET locked_until = $2::timestamptz,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid AND is_active = true`,
      [userId, lockedUntil]
    );
    return r.rowCount ?? 0;
  } catch (error) {
    if (isMissingRelationError(error)) return 0;
    throw error;
  }
}

export async function activateArtistsInArchive(
  userId: string,
  artistUserIds: string[]
): Promise<number> {
  const uniqueIds = [...new Set(artistUserIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  const subscription = await getViewerSubscription(userId);
  if (!hasPremiumAccess(subscription)) {
    throw new ArchiveSubscriptionRequiredError('Active subscription required to activate artists');
  }

  const slotsLimit = subscription!.slotsLimit;
  const slotsUsed = await countUserArchiveSlots(userId);
  const availableSlots = Math.max(0, slotsLimit - slotsUsed);

  if (availableSlots <= 0) {
    throw new ArchiveSlotsLimitError(slotsUsed, slotsLimit);
  }

  const toActivate = uniqueIds.slice(0, availableSlots);
  if (toActivate.length === 0) {
    throw new ArchiveSlotsLimitError(slotsUsed, slotsLimit);
  }

  const lockedUntil = subscription!.expiresAt;
  if (!lockedUntil) {
    throw new ArchiveSubscriptionRequiredError();
  }

  const r = await query(
    `UPDATE user_archive
     SET is_active = true,
         locked_until = $3::timestamptz,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1::uuid
       AND artist_user_id = ANY($2::uuid[])
       AND is_active = false`,
    [userId, toActivate, lockedUntil]
  );

  return r.rowCount ?? 0;
}

async function getArchiveRow(userId: string, artistUserId: string): Promise<UserArchiveRow | null> {
  const r = await query<UserArchiveRow>(
    `SELECT id, user_id, artist_user_id, created_at, updated_at, is_active, locked_until
     FROM user_archive
     WHERE user_id = $1::uuid AND artist_user_id = $2::uuid
     LIMIT 1`,
    [userId, artistUserId]
  );
  return r.rows[0] ?? null;
}

export async function addArtistToArchive(
  userId: string,
  artistUserId: string
): Promise<UserArchiveEntry> {
  if (userId === artistUserId) {
    throw new Error('Cannot add yourself to collection');
  }

  const existing = await getArchiveRow(userId, artistUserId);
  if (existing) {
    if (existing.is_active !== false) {
      return mapUserArchiveRow(existing);
    }

    const subscription = await getViewerSubscription(userId);
    if (!hasPremiumAccess(subscription)) {
      throw new ArchiveSubscriptionRequiredError();
    }

    const slotsLimit = subscription!.slotsLimit;
    const slotsUsed = await countUserArchiveSlots(userId);
    if (slotsUsed >= slotsLimit) {
      throw new ArchiveSlotsLimitError(slotsUsed, slotsLimit);
    }

    const lockedUntil = subscription!.expiresAt;
    if (!lockedUntil) {
      throw new ArchiveSubscriptionRequiredError();
    }

    const updated = await query<UserArchiveRow>(
      `UPDATE user_archive
       SET is_active = true,
           locked_until = $2::timestamptz,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, user_id, artist_user_id, created_at, updated_at, is_active, locked_until`,
      [existing.id, lockedUntil]
    );
    const row = updated.rows[0];
    if (!row) throw new Error('Failed to reactivate artist in collection');
    return mapUserArchiveRow(row);
  }

  const subscription = await getViewerSubscription(userId);
  if (!hasPremiumAccess(subscription)) {
    throw new ArchiveSubscriptionRequiredError();
  }

  const slotsLimit = subscription!.slotsLimit;
  const slotsUsed = await countUserArchiveSlots(userId);
  if (slotsUsed >= slotsLimit) {
    throw new ArchiveSlotsLimitError(slotsUsed, slotsLimit);
  }

  const lockedUntil = subscription!.expiresAt;
  if (!lockedUntil) {
    throw new ArchiveSubscriptionRequiredError();
  }

  const r = await query<UserArchiveRow>(
    `INSERT INTO user_archive (user_id, artist_user_id, is_active, locked_until)
     VALUES ($1::uuid, $2::uuid, true, $3::timestamptz)
     RETURNING id, user_id, artist_user_id, created_at, updated_at, is_active, locked_until`,
    [userId, artistUserId, lockedUntil]
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error('Failed to add artist to collection');
  }
  return mapUserArchiveRow(row);
}

export async function removeArtistFromArchive(
  userId: string,
  artistUserId: string
): Promise<boolean> {
  const existing = await getArchiveRow(userId, artistUserId);
  if (!existing) {
    return false;
  }

  if (existing.is_active !== false) {
    const subscription = await getViewerSubscription(userId);
    if (!hasPremiumAccess(subscription)) {
      throw new ArchiveSubscriptionRequiredError(
        'Active subscription required to remove active artists from collection'
      );
    }

    if (isArchiveArtistLocked(existing.locked_until ?? null)) {
      const lockedUntil =
        existing.locked_until instanceof Date
          ? existing.locked_until
          : new Date(existing.locked_until!);
      throw new ArchiveArtistLockedError(artistUserId, lockedUntil);
    }
  }

  const r = await query(
    `DELETE FROM user_archive
     WHERE user_id = $1::uuid AND artist_user_id = $2::uuid`,
    [userId, artistUserId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getArchiveStatusForArtist(
  userId: string,
  artistUserId: string
): Promise<ArchiveStatus> {
  const [artistInArchive, artistActiveInArchive, slotsUsed, subscription] = await Promise.all([
    userHasArtistInArchive(userId, artistUserId),
    userHasActiveArtistInArchive(userId, artistUserId),
    countUserArchiveSlots(userId),
    getViewerSubscription(userId),
  ]);

  return {
    isPremium: hasPremiumAccess(subscription),
    artistInArchive,
    artistActiveInArchive,
    slotsUsed,
    slotsLimit: subscription?.slotsLimit ?? SUBSCRIPTION_SLOTS_LIMIT_FALLBACK,
  };
}

export interface MyArchiveArtistDto {
  id: string;
  artistUserId: string;
  slug: string;
  name: string;
  genreCode: string;
  genreLabel: { en: string; ru: string };
  cover: string | null;
  addedAt: string;
  isActive: boolean;
  lockedUntil: string | null;
  isLocked: boolean;
}

export interface MyArchiveDto {
  isPremium: boolean;
  slotsUsed: number;
  slotsLimit: number;
  inactiveCount: number;
  subscriptionExpiresAt: string | null;
  billing: BillingSnapshot;
  artists: MyArchiveArtistDto[];
}

function toSubscriptionExpiresAtIso(expiresAt: Date | null | undefined): string | null {
  if (!expiresAt) return null;
  if (expiresAt instanceof Date) {
    return Number.isNaN(expiresAt.getTime()) ? null : expiresAt.toISOString();
  }
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

interface MyArchiveRow {
  id: string;
  artist_user_id: string;
  created_at: Date;
  is_active?: boolean;
  locked_until?: Date | null;
  public_slug: string | null;
  site_name: string | null;
  name: string | null;
  genre_code: string | null;
  label_en: string | null;
  label_ru: string | null;
  header_images: unknown;
}

function toArtistCoverUrl(userId: string, image: string): string {
  const value = image.trim();
  if (!value) return '';

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/proxy-image') ||
    value.startsWith('/.netlify/functions/proxy-image')
  ) {
    return value;
  }

  const hasExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(value);
  const path = value.startsWith('users/')
    ? value
    : `users/${userId}/hero/${hasExt ? value : `${value}.jpg`}`;

  return `/api/proxy-image?path=${encodeURIComponent(path)}`;
}

function pickFirstHeaderCover(userId: string, headerImages: unknown): string | null {
  if (!Array.isArray(headerImages) || headerImages.length === 0) return null;
  for (const raw of headerImages) {
    const url = toArtistCoverUrl(userId, String(raw));
    if (url) return url;
  }
  return null;
}

export async function getMyArchiveForUser(userId: string): Promise<MyArchiveDto> {
  const subscription = await getViewerSubscription(userId);
  const slotsLimit = subscription?.slotsLimit ?? SUBSCRIPTION_SLOTS_LIMIT_FALLBACK;

  try {
    const now = new Date();
    const r = await query<MyArchiveRow>(
      `SELECT
         ua.id,
         ua.artist_user_id,
         ua.created_at,
         ua.is_active,
         ua.locked_until,
         u.public_slug,
         u.site_name,
         u.name,
         u.genre_code,
         g.label_en,
         g.label_ru,
         u.header_images
       FROM user_archive ua
       JOIN users u ON u.id = ua.artist_user_id
       LEFT JOIN genres g ON g.code = u.genre_code
       WHERE ua.user_id = $1::uuid
       ORDER BY ua.created_at ASC`,
      [userId]
    );

    const artists: MyArchiveArtistDto[] = r.rows.map((row) => {
      const genreCode = row.genre_code || 'other';
      const displayName =
        row.site_name?.trim() || row.name?.trim() || row.public_slug?.trim() || 'Artist';
      const isActive = row.is_active === true;
      const lockedUntilDate = row.locked_until ?? null;
      const lockedUntil = toLockedUntilIso(lockedUntilDate);
      return {
        id: row.id,
        artistUserId: row.artist_user_id,
        slug: row.public_slug?.trim() || '',
        name: displayName,
        genreCode,
        genreLabel: {
          en: row.label_en || 'Other',
          ru: row.label_ru || 'Другое',
        },
        cover: pickFirstHeaderCover(row.artist_user_id, row.header_images),
        addedAt: row.created_at.toISOString(),
        isActive,
        lockedUntil,
        isLocked: isActive && isArchiveArtistLocked(lockedUntilDate, now),
      };
    });

    const slotsUsed = artists.filter((a) => a.isActive).length;
    const inactiveCount = artists.filter((a) => !a.isActive).length;

    return {
      isPremium: hasPremiumAccess(subscription),
      slotsUsed,
      slotsLimit,
      inactiveCount,
      subscriptionExpiresAt: toSubscriptionExpiresAtIso(subscription?.expiresAt),
      billing: buildBillingSnapshot(subscription, { slotsLimitFallback: slotsLimit }),
      artists,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        isPremium: hasPremiumAccess(subscription),
        slotsUsed: 0,
        slotsLimit,
        inactiveCount: 0,
        subscriptionExpiresAt: toSubscriptionExpiresAtIso(subscription?.expiresAt),
        billing: buildBillingSnapshot(subscription, { slotsLimitFallback: slotsLimit }),
        artists: [],
      };
    }
    throw error;
  }
}
