/**
 * User notifications — insert + read helpers (album comments MVP).
 */

import type { AlbumCommentContext } from './album-comments';
import { query } from './db';

export type UserNotificationType = 'comment' | 'comment_like' | 'collection_add';

export const USER_NOTIFICATIONS_DROPDOWN_LIMIT = 10;
export const USER_NOTIFICATIONS_PAGE_LIMIT = 25;
export const USER_NOTIFICATIONS_MAX_LIMIT = 30;
export const USER_NOTIFICATIONS_RETENTION_DAYS = 90;

function rowToIso(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function decodeNotificationCursor(
  cursor: string | undefined
): { createdAt: string; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    if (!json.createdAt || !json.id) return null;
    return { createdAt: json.createdAt, id: json.id };
  } catch {
    return null;
  }
}

function encodeNotificationCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
}

export function clampUserNotificationsLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? String(fallback), 10);
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(n, 1), USER_NOTIFICATIONS_MAX_LIMIT);
}

export function resolveCommentNotificationRecipient(input: {
  actorUserId: string;
  artistUserId: string;
  /** Author of the comment being replied to; null for a new root comment. */
  parentCommentAuthorUserId: string | null;
}): string | null {
  const recipient =
    input.parentCommentAuthorUserId != null ? input.parentCommentAuthorUserId : input.artistUserId;
  if (!recipient || recipient === input.actorUserId) return null;
  return recipient;
}

async function loadAlbumTitle(artistUserId: string, albumId: string): Promise<string> {
  const result = await query<{ title: string }>(
    `SELECT COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(album), ''), album_id) AS title
     FROM albums
     WHERE user_id = $1::uuid AND album_id = $2
     ORDER BY (lang = 'en') DESC NULLS LAST, lang ASC
     LIMIT 1`,
    [artistUserId, albumId],
    0
  );
  return result.rows[0]?.title?.trim() || albumId;
}

async function loadArtistPublicSlug(artistUserId: string): Promise<string> {
  const result = await query<{ public_slug: string | null }>(
    `SELECT NULLIF(TRIM(public_slug), '') AS public_slug FROM users WHERE id = $1::uuid LIMIT 1`,
    [artistUserId],
    0
  );
  return result.rows[0]?.public_slug?.trim() || '';
}

export async function insertCommentLikeUserNotification(input: {
  commentId: string;
  recipientUserId: string;
  actorUserId: string;
  artistUserId: string;
  albumId: string;
}): Promise<void> {
  if (!input.recipientUserId || input.recipientUserId === input.actorUserId) return;

  const [albumTitle, artistSlug] = await Promise.all([
    loadAlbumTitle(input.artistUserId, input.albumId),
    loadArtistPublicSlug(input.artistUserId),
  ]);
  if (!artistSlug) return;

  await query(
    `INSERT INTO user_notifications (
       recipient_user_id, type, comment_id, album_id, artist_slug, album_title, actor_user_id
     )
     SELECT $1::uuid, 'comment_like', $2::uuid, $3, $4, $5, $6::uuid
     WHERE NOT EXISTS (
       SELECT 1 FROM user_notifications
       WHERE recipient_user_id = $1::uuid
         AND comment_id = $2::uuid
         AND actor_user_id = $6::uuid
         AND type = 'comment_like'
     )`,
    [
      input.recipientUserId,
      input.commentId,
      input.albumId,
      artistSlug,
      albumTitle,
      input.actorUserId,
    ],
    0
  );
}

/** Anonymous artist alert: listener added artist to active collection (no actor stored). */
export async function insertCollectionAddUserNotification(input: {
  artistUserId: string;
}): Promise<void> {
  if (!input.artistUserId?.trim()) return;

  await query(
    `INSERT INTO user_notifications (
       recipient_user_id, type, comment_id, album_id, artist_slug, album_title, actor_user_id
     )
     VALUES ($1::uuid, 'collection_add', NULL, '', '', '', NULL)`,
    [input.artistUserId],
    0
  );
}

export async function insertCommentUserNotification(input: {
  ctx: AlbumCommentContext;
  commentId: string;
  actorUserId: string;
  parentCommentAuthorUserId: string | null;
}): Promise<void> {
  const recipientId = resolveCommentNotificationRecipient({
    actorUserId: input.actorUserId,
    artistUserId: input.ctx.artistUserId,
    parentCommentAuthorUserId: input.parentCommentAuthorUserId,
  });
  if (!recipientId) return;

  const albumTitle = await loadAlbumTitle(input.ctx.artistUserId, input.ctx.albumId);

  await query(
    `INSERT INTO user_notifications (
       recipient_user_id, type, comment_id, album_id, artist_slug, album_title, actor_user_id
     )
     VALUES ($1::uuid, 'comment', $2::uuid, $3, $4, $5, $6::uuid)`,
    [
      recipientId,
      input.commentId,
      input.ctx.albumId,
      input.ctx.artistSlug,
      albumTitle,
      input.actorUserId,
    ],
    0
  );
}

export interface UserNotificationRow {
  id: string;
  type: UserNotificationType;
  comment_id: string | null;
  album_id: string;
  artist_slug: string;
  album_title: string;
  actor_user_id: string | null;
  is_read: boolean;
  created_at: Date;
}

export function mapUserNotificationRow(r: UserNotificationRow) {
  const anonymous = r.type === 'collection_add';
  return {
    id: r.id,
    type: r.type,
    commentId: r.comment_id ?? null,
    albumId: anonymous ? null : r.album_id,
    artistSlug: anonymous ? null : r.artist_slug,
    albumTitle: anonymous ? null : r.album_title,
    actorUserId: anonymous ? null : (r.actor_user_id ?? null),
    isRead: r.is_read,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function countUnreadUserNotifications(userId: string): Promise<number> {
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM user_notifications
     WHERE recipient_user_id = $1::uuid AND is_read = false`,
    [userId],
    0
  );
  return Number.parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

export type UserNotificationsPageDto = {
  notifications: UserNotificationRow[];
  nextCursor: string | null;
};

export async function listUserNotificationsPage(input: {
  userId: string;
  limit: number;
  cursor?: string;
}): Promise<UserNotificationsPageDto> {
  const limit = Math.min(Math.max(input.limit, 1), USER_NOTIFICATIONS_MAX_LIMIT);
  const decoded = decodeNotificationCursor(input.cursor);
  const params: unknown[] = [input.userId, limit + 1];
  let where = 'recipient_user_id = $1::uuid';
  if (decoded) {
    where += ` AND (created_at, id) < ($3::timestamptz, $4::uuid)`;
    params.push(decoded.createdAt, decoded.id);
  }

  const result = await query<UserNotificationRow>(
    `SELECT id::text AS id,
            type,
            comment_id::text AS comment_id,
            album_id,
            artist_slug,
            album_title,
            actor_user_id::text AS actor_user_id,
            is_read,
            created_at
     FROM user_notifications
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    params,
    0
  );

  const page = result.rows.slice(0, limit);
  let nextCursor: string | null = null;
  if (result.rows.length > limit) {
    const last = page[page.length - 1];
    if (last) {
      nextCursor = encodeNotificationCursor(rowToIso(last.created_at), last.id);
    }
  }

  return { notifications: page, nextCursor };
}

/** @deprecated Use listUserNotificationsPage */
export async function listUserNotifications(
  userId: string,
  limit = USER_NOTIFICATIONS_DROPDOWN_LIMIT
): Promise<UserNotificationRow[]> {
  const page = await listUserNotificationsPage({ userId, limit });
  return page.notifications;
}

export async function purgeUserNotificationsOlderThanDays(days: number): Promise<number> {
  const safeDays = Math.max(1, Math.min(days, 365));
  const result = await query<{ c: string }>(
    `WITH deleted AS (
       DELETE FROM user_notifications
       WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id
     )
     SELECT COUNT(*)::text AS c FROM deleted`,
    [safeDays],
    0
  );
  return Number.parseInt(result.rows[0]?.c ?? '0', 10) || 0;
}

export async function markUserNotificationRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE user_notifications
     SET is_read = true
     WHERE id = $1::uuid AND recipient_user_id = $2::uuid AND is_read = false
     RETURNING id::text AS id`,
    [notificationId, userId],
    0
  );
  return result.rows.length > 0;
}
