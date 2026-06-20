/**
 * Artist archive: список открытых артистов пользователя.
 * Отдельно от subscriptions; записи сохраняются при истечении подписки.
 */

import { isMissingRelationError, query } from './db';
import { getViewerSubscription, isSubscriptionActive } from './subscriptions';

export interface UserArchiveEntry {
  id: string;
  userId: string;
  artistUserId: string;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil: Date | null;
}

export interface ArchiveStatus {
  isPremium: boolean;
  artistInArchive: boolean;
  slotsUsed: number;
  slotsLimit: number;
}

interface UserArchiveRow {
  id: string;
  user_id: string;
  artist_user_id: string;
  created_at: Date;
  updated_at: Date;
  locked_until?: Date | null;
}

export class ArchiveSlotsLimitError extends Error {
  readonly code = 'ARCHIVE_SLOTS_LIMIT';

  constructor(
    public readonly slotsUsed: number,
    public readonly slotsLimit: number
  ) {
    super(`Archive slots limit reached (${slotsUsed}/${slotsLimit})`);
    this.name = 'ArchiveSlotsLimitError';
  }
}

export class ArchiveSubscriptionRequiredError extends Error {
  readonly code = 'ARCHIVE_SUBSCRIPTION_REQUIRED';

  constructor(message = 'Active subscription required for archive changes') {
    super(message);
    this.name = 'ArchiveSubscriptionRequiredError';
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
  now: Date = new Date()
): boolean {
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
    lockedUntil: row.locked_until ?? null,
  };
}

export async function getUserArchiveArtists(userId: string): Promise<string[]> {
  const r = await query<{ artist_user_id: string }>(
    `SELECT artist_user_id
     FROM user_archive
     WHERE user_id = $1::uuid
     ORDER BY created_at ASC`,
    [userId]
  );
  return r.rows.map((row) => row.artist_user_id);
}

export async function countUserArchiveSlots(userId: string): Promise<number> {
  const r = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM user_archive WHERE user_id = $1::uuid`,
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

export async function addArtistToArchive(
  userId: string,
  artistUserId: string
): Promise<UserArchiveEntry> {
  if (userId === artistUserId) {
    throw new Error('Cannot add yourself to archive');
  }

  const alreadyInArchive = await userHasArtistInArchive(userId, artistUserId);
  if (alreadyInArchive) {
    const r = await query<UserArchiveRow>(
      `SELECT id, user_id, artist_user_id, created_at, updated_at, locked_until
       FROM user_archive
       WHERE user_id = $1::uuid AND artist_user_id = $2::uuid
       LIMIT 1`,
      [userId, artistUserId]
    );
    const row = r.rows[0];
    if (!row) {
      throw new Error('Archive entry not found');
    }
    return mapUserArchiveRow(row);
  }

  const subscription = await getViewerSubscription(userId);
  if (!isSubscriptionActive(subscription)) {
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
    `INSERT INTO user_archive (user_id, artist_user_id, locked_until)
     VALUES ($1::uuid, $2::uuid, $3::timestamptz)
     RETURNING id, user_id, artist_user_id, created_at, updated_at, locked_until`,
    [userId, artistUserId, lockedUntil]
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error('Failed to add artist to archive');
  }
  return mapUserArchiveRow(row);
}

export async function removeArtistFromArchive(
  userId: string,
  artistUserId: string
): Promise<boolean> {
  const subscription = await getViewerSubscription(userId);
  if (!isSubscriptionActive(subscription)) {
    throw new ArchiveSubscriptionRequiredError(
      'Active subscription required to remove artists from archive'
    );
  }

  const existing = await query<Pick<UserArchiveRow, 'id' | 'locked_until'>>(
    `SELECT id, locked_until
     FROM user_archive
     WHERE user_id = $1::uuid AND artist_user_id = $2::uuid
     LIMIT 1`,
    [userId, artistUserId]
  );
  const row = existing.rows[0];
  if (!row) {
    return false;
  }

  if (isArchiveArtistLocked(row.locked_until ?? null)) {
    const lockedUntil =
      row.locked_until instanceof Date ? row.locked_until : new Date(row.locked_until!);
    throw new ArchiveArtistLockedError(artistUserId, lockedUntil);
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
  artistUserId: string,
  isPremium: boolean
): Promise<ArchiveStatus> {
  const [artistInArchive, slotsUsed, subscription] = await Promise.all([
    userHasArtistInArchive(userId, artistUserId),
    countUserArchiveSlots(userId),
    getViewerSubscription(userId),
  ]);

  return {
    isPremium,
    artistInArchive,
    slotsUsed,
    slotsLimit: subscription?.slotsLimit ?? 3,
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
  lockedUntil: string | null;
  isLocked: boolean;
}

export interface MyArchiveDto {
  isPremium: boolean;
  slotsUsed: number;
  slotsLimit: number;
  artists: MyArchiveArtistDto[];
}

interface MyArchiveRow {
  id: string;
  artist_user_id: string;
  created_at: Date;
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
  const slotsLimit = subscription?.slotsLimit ?? 3;

  try {
    const now = new Date();
    const r = await query<MyArchiveRow>(
      `SELECT
         ua.id,
         ua.artist_user_id,
         ua.created_at,
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
      const lockedUntilDate = row.locked_until ?? null;
      const lockedUntil =
        lockedUntilDate instanceof Date
          ? lockedUntilDate.toISOString()
          : lockedUntilDate
            ? new Date(lockedUntilDate).toISOString()
            : null;
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
        lockedUntil,
        isLocked: isArchiveArtistLocked(lockedUntilDate, now),
      };
    });

    return {
      isPremium: isSubscriptionActive(subscription),
      slotsUsed: artists.length,
      slotsLimit,
      artists,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        isPremium: isSubscriptionActive(subscription),
        slotsUsed: 0,
        slotsLimit,
        artists: [],
      };
    }
    throw error;
  }
}
