/**
 * Album page comments — persistence and authorization helpers.
 */

import { query } from './db';
import { isArtistAccountType } from './account-type';
import { resolveAlbumForCopyrightReport } from './copyright-claims';
import {
  MAX_COMMENT_BODY_CHARS,
  normalizeCommentBody,
  resolveCommentDisplayName,
} from './album-comment-text';

export { MAX_COMMENT_BODY_CHARS, normalizeCommentBody, resolveCommentDisplayName };
export const ROOT_COMMENTS_PAGE_SIZE = 20;

export interface AlbumCommentContext {
  albumId: string;
  artistUserId: string;
  artistSlug: string;
}

export interface CommentAuthorDto {
  userId: string;
  displayName: string;
  avatarPath: string | null;
  isArtist: boolean;
  publicSlug: string | null;
}

export interface AlbumCommentDto {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isEdited: boolean;
  author: CommentAuthorDto;
  likeCount: number;
  likedByViewer: boolean;
  replies: AlbumCommentDto[];
}

export interface AlbumCommentsSummaryDto {
  totalCount: number;
  recentCommenters: Array<{
    userId: string;
    displayName: string;
    avatarPath: string | null;
  }>;
}

export interface AlbumCommentsPageDto {
  comments: AlbumCommentDto[];
  nextCursor: string | null;
  totalRootCount: number;
}

interface CommentRow {
  id: string;
  artist_user_id: string;
  album_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  name: string | null;
  site_name: string | null;
  username: string | null;
  profile_avatar_path: string | null;
  account_type: string | null;
  public_slug: string | null;
}

function rowToIso(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export async function resolveAlbumCommentContext(input: {
  albumId: string;
  artistSlug: string;
}): Promise<AlbumCommentContext | null> {
  const albumSlug = input.albumId.trim();
  const slug = input.artistSlug.trim();
  if (!albumSlug || !slug) return null;

  const row = await resolveAlbumForCopyrightReport({ albumSlugId: albumSlug, artistSlug: slug });
  if (!row) return null;

  const owner = await query<{ user_id: string }>(
    `SELECT DISTINCT u.id::text AS user_id
     FROM albums a
     INNER JOIN users u ON u.id = a.user_id
     WHERE a.album_id = $1
       AND u.public_slug IS NOT NULL
       AND LOWER(TRIM(u.public_slug)) = LOWER(TRIM($2))
     LIMIT 1`,
    [albumSlug, slug],
    0
  );
  const userId = owner.rows[0]?.user_id;
  if (!userId) return null;

  return {
    albumId: albumSlug,
    artistUserId: userId,
    artistSlug: row.artist_slug,
  };
}

async function fetchLikeCounts(commentIds: string[]): Promise<Map<string, number>> {
  if (commentIds.length === 0) return new Map();
  const result = await query<{ comment_id: string; cnt: string }>(
    `SELECT comment_id::text AS comment_id, COUNT(*)::text AS cnt
     FROM album_comment_likes
     WHERE comment_id = ANY($1::uuid[])
     GROUP BY comment_id`,
    [commentIds],
    0
  );
  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.comment_id, Number.parseInt(row.cnt, 10) || 0);
  }
  return map;
}

async function fetchViewerLikes(
  commentIds: string[],
  viewerUserId: string | null
): Promise<Set<string>> {
  if (!viewerUserId || commentIds.length === 0) return new Set();
  const result = await query<{ comment_id: string }>(
    `SELECT comment_id::text AS comment_id
     FROM album_comment_likes
     WHERE comment_id = ANY($1::uuid[]) AND user_id = $2::uuid`,
    [commentIds, viewerUserId],
    0
  );
  return new Set(result.rows.map((r) => r.comment_id));
}

function mapRowToDto(
  row: CommentRow,
  likeCount: number,
  likedByViewer: boolean
): Omit<AlbumCommentDto, 'replies'> {
  const createdAt = rowToIso(row.created_at);
  const updatedAt = rowToIso(row.updated_at);
  const deletedAt = row.deleted_at ? rowToIso(row.deleted_at) : null;
  const isEdited =
    !deletedAt && new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;

  return {
    id: row.id,
    parentId: row.parent_id,
    body: row.body,
    createdAt,
    updatedAt,
    deletedAt,
    isEdited,
    author: {
      userId: row.user_id,
      displayName: resolveCommentDisplayName(row),
      avatarPath: row.profile_avatar_path?.trim() || null,
      isArtist: isArtistAccountType(row.account_type),
      publicSlug: row.public_slug?.trim() || null,
    },
    likeCount,
    likedByViewer,
  };
}

export async function getAlbumCommentsSummary(
  ctx: AlbumCommentContext
): Promise<AlbumCommentsSummaryDto> {
  const countResult = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM album_comments
     WHERE artist_user_id = $1::uuid
       AND album_id = $2
       AND deleted_at IS NULL`,
    [ctx.artistUserId, ctx.albumId],
    0
  );
  const totalCount = Number.parseInt(countResult.rows[0]?.cnt ?? '0', 10) || 0;

  const commenters = await query<{
    user_id: string;
    name: string | null;
    site_name: string | null;
    username: string | null;
    profile_avatar_path: string | null;
    last_at: Date;
  }>(
    `SELECT c.user_id::text AS user_id,
            u.name,
            u.site_name,
            u.username,
            u.profile_avatar_path,
            MAX(c.created_at) AS last_at
     FROM album_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.artist_user_id = $1::uuid
       AND c.album_id = $2
       AND c.deleted_at IS NULL
     GROUP BY c.user_id, u.name, u.site_name, u.username, u.profile_avatar_path
     ORDER BY last_at DESC
     LIMIT 3`,
    [ctx.artistUserId, ctx.albumId],
    0
  );

  return {
    totalCount,
    recentCommenters: commenters.rows.map((row) => ({
      userId: row.user_id,
      displayName: resolveCommentDisplayName(row),
      avatarPath: row.profile_avatar_path?.trim() || null,
    })),
  };
}

function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
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

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
}

export async function listAlbumCommentsPage(input: {
  ctx: AlbumCommentContext;
  viewerUserId: string | null;
  cursor?: string;
  limit?: number;
}): Promise<AlbumCommentsPageDto> {
  const limit = Math.min(Math.max(input.limit ?? ROOT_COMMENTS_PAGE_SIZE, 1), 50);
  const decoded = decodeCursor(input.cursor);

  const countRoots = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM album_comments
     WHERE artist_user_id = $1::uuid
       AND album_id = $2
       AND parent_id IS NULL`,
    [input.ctx.artistUserId, input.ctx.albumId],
    0
  );
  const totalRootCount = Number.parseInt(countRoots.rows[0]?.cnt ?? '0', 10) || 0;

  const rootParams: unknown[] = [input.ctx.artistUserId, input.ctx.albumId, limit + 1];
  let rootWhere = 'c.artist_user_id = $1::uuid AND c.album_id = $2 AND c.parent_id IS NULL';
  if (decoded) {
    rootWhere += ` AND (c.created_at, c.id) < ($4::timestamptz, $5::uuid)`;
    rootParams.push(decoded.createdAt, decoded.id);
  }

  const roots = await query<CommentRow>(
    `SELECT c.id::text AS id,
            c.artist_user_id::text AS artist_user_id,
            c.album_id,
            c.user_id::text AS user_id,
            c.parent_id::text AS parent_id,
            c.body,
            c.created_at,
            c.updated_at,
            c.deleted_at,
            u.name,
            u.site_name,
            u.username,
            u.profile_avatar_path,
            u.account_type,
            u.public_slug
     FROM album_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE ${rootWhere}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $3`,
    rootParams,
    0
  );

  const pageRoots = roots.rows.slice(0, limit);
  let nextCursor: string | null = null;
  if (roots.rows.length > limit) {
    const last = pageRoots[pageRoots.length - 1];
    if (last) {
      nextCursor = encodeCursor(rowToIso(last.created_at), last.id);
    }
  }

  const rootIds = pageRoots.map((r) => r.id);
  let replyRows: CommentRow[] = [];
  if (rootIds.length > 0) {
    const replies = await query<CommentRow>(
      `SELECT c.id::text AS id,
              c.artist_user_id::text AS artist_user_id,
              c.album_id,
              c.user_id::text AS user_id,
              c.parent_id::text AS parent_id,
              c.body,
              c.created_at,
              c.updated_at,
              c.deleted_at,
              u.name,
              u.site_name,
              u.username,
              u.profile_avatar_path,
              u.account_type,
              u.public_slug
       FROM album_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.parent_id = ANY($1::uuid[])
       ORDER BY c.created_at ASC, c.id ASC`,
      [rootIds],
      0
    );
    replyRows = replies.rows;
  }

  const allIds = [...rootIds, ...replyRows.map((r) => r.id)];
  const [likeCounts, viewerLikes] = await Promise.all([
    fetchLikeCounts(allIds),
    fetchViewerLikes(allIds, input.viewerUserId),
  ]);

  const repliesByParent = new Map<string, AlbumCommentDto[]>();
  for (const row of replyRows) {
    const parentKey = row.parent_id ?? '';
    const dto: AlbumCommentDto = {
      ...mapRowToDto(row, likeCounts.get(row.id) ?? 0, viewerLikes.has(row.id)),
      replies: [],
    };
    const list = repliesByParent.get(parentKey) ?? [];
    list.push(dto);
    repliesByParent.set(parentKey, list);
  }

  const comments: AlbumCommentDto[] = pageRoots.map((row) => ({
    ...mapRowToDto(row, likeCounts.get(row.id) ?? 0, viewerLikes.has(row.id)),
    replies: repliesByParent.get(row.id) ?? [],
  }));

  return { comments, nextCursor, totalRootCount };
}

export async function getCommentById(commentId: string): Promise<CommentRow | null> {
  const result = await query<CommentRow>(
    `SELECT c.id::text AS id,
            c.artist_user_id::text AS artist_user_id,
            c.album_id,
            c.user_id::text AS user_id,
            c.parent_id::text AS parent_id,
            c.body,
            c.created_at,
            c.updated_at,
            c.deleted_at,
            u.name,
            u.site_name,
            u.username,
            u.profile_avatar_path,
            u.account_type,
            u.public_slug
     FROM album_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [commentId],
    0
  );
  return result.rows[0] ?? null;
}

async function fetchSingleCommentDto(
  commentId: string,
  viewerUserId: string | null
): Promise<AlbumCommentDto | null> {
  const row = await getCommentById(commentId);
  if (!row) return null;
  const likeCounts = await fetchLikeCounts([row.id]);
  const viewerLikes = await fetchViewerLikes([row.id], viewerUserId);
  return {
    ...mapRowToDto(row, likeCounts.get(row.id) ?? 0, viewerLikes.has(row.id)),
    replies: [],
  };
}

export async function createAlbumComment(input: {
  ctx: AlbumCommentContext;
  userId: string;
  body: string;
  parentId?: string | null;
  viewerUserId: string;
}): Promise<{ comment: AlbumCommentDto } | { error: string; status: number }> {
  let effectiveParentId: string | null = null;
  if (input.parentId) {
    const parent = await getCommentById(input.parentId);
    if (!parent) return { error: 'Parent comment not found', status: 404 };
    if (parent.artist_user_id !== input.ctx.artistUserId || parent.album_id !== input.ctx.albumId) {
      return { error: 'Parent comment not found', status: 404 };
    }
    effectiveParentId = parent.parent_id ?? parent.id;
    if (parent.parent_id) {
      const root = await getCommentById(effectiveParentId);
      if (!root || root.parent_id !== null) {
        return { error: 'Invalid parent comment', status: 400 };
      }
    }
  }

  const insert = await query<{ id: string }>(
    `INSERT INTO album_comments (artist_user_id, album_id, user_id, parent_id, body)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5)
     RETURNING id::text AS id`,
    [input.ctx.artistUserId, input.ctx.albumId, input.userId, effectiveParentId, input.body],
    0
  );
  const id = insert.rows[0]?.id;
  if (!id) return { error: 'Failed to create comment', status: 500 };

  const comment = await fetchSingleCommentDto(id, input.viewerUserId);
  if (!comment) return { error: 'Failed to load comment', status: 500 };
  return { comment };
}

export async function updateAlbumComment(input: {
  commentId: string;
  userId: string;
  body: string;
  viewerUserId: string;
}): Promise<{ comment: AlbumCommentDto } | { error: string; status: number }> {
  const existing = await getCommentById(input.commentId);
  if (!existing || existing.deleted_at) {
    return { error: 'Comment not found', status: 404 };
  }
  if (existing.user_id !== input.userId) {
    return { error: 'Forbidden', status: 403 };
  }

  await query(
    `UPDATE album_comments SET body = $1, updated_at = NOW() WHERE id = $2::uuid AND user_id = $3::uuid`,
    [input.body, input.commentId, input.userId],
    0
  );

  const comment = await fetchSingleCommentDto(input.commentId, input.viewerUserId);
  if (!comment) return { error: 'Comment not found', status: 404 };
  return { comment };
}

export async function softDeleteAlbumComment(input: {
  commentId: string;
  userId: string;
  viewerUserId: string;
}): Promise<{ comment: AlbumCommentDto } | { error: string; status: number }> {
  const existing = await getCommentById(input.commentId);
  if (!existing) {
    return { error: 'Comment not found', status: 404 };
  }

  const isOwner = existing.user_id === input.userId;
  const isAlbumArtist = existing.artist_user_id === input.userId;
  if (!isOwner && !isAlbumArtist) {
    return { error: 'Forbidden', status: 403 };
  }

  if (!existing.deleted_at) {
    await query(
      `UPDATE album_comments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      [input.commentId],
      0
    );
  }

  const comment = await fetchSingleCommentDto(input.commentId, input.viewerUserId);
  if (!comment) return { error: 'Comment not found', status: 404 };
  return { comment };
}

export async function toggleAlbumCommentLike(input: {
  commentId: string;
  userId: string;
  viewerUserId: string;
}): Promise<
  { liked: boolean; likeCount: number; createdLike: boolean } | { error: string; status: number }
> {
  const existing = await getCommentById(input.commentId);
  if (!existing || existing.deleted_at) {
    return { error: 'Comment not found', status: 404 };
  }

  const likedResult = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM album_comment_likes
       WHERE comment_id = $1::uuid AND user_id = $2::uuid
     ) AS exists`,
    [input.commentId, input.userId],
    0
  );
  const currentlyLiked = likedResult.rows[0]?.exists === true;

  let createdLike = false;

  if (currentlyLiked) {
    await query(
      `DELETE FROM album_comment_likes WHERE comment_id = $1::uuid AND user_id = $2::uuid`,
      [input.commentId, input.userId],
      0
    );
  } else {
    if (existing.user_id === input.userId) {
      return { error: 'Cannot like your own comment', status: 400 };
    }
    const insert = await query<{ comment_id: string }>(
      `INSERT INTO album_comment_likes (comment_id, user_id) VALUES ($1::uuid, $2::uuid)
       ON CONFLICT DO NOTHING
       RETURNING comment_id::text AS comment_id`,
      [input.commentId, input.userId],
      0
    );
    createdLike = insert.rows.length > 0;
  }

  const countResult = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM album_comment_likes WHERE comment_id = $1::uuid`,
    [input.commentId],
    0
  );
  const likeCount = Number.parseInt(countResult.rows[0]?.cnt ?? '0', 10) || 0;

  return { liked: !currentlyLiked, likeCount, createdLike };
}

export async function reportAlbumComment(input: {
  commentId: string;
  userId: string;
  reason?: string | null;
}): Promise<{ reported: boolean } | { error: string; status: number; code?: string }> {
  const existing = await getCommentById(input.commentId);
  if (!existing || existing.deleted_at) {
    return { error: 'Comment not found', status: 404 };
  }
  if (existing.user_id === input.userId) {
    return { error: 'Cannot report your own comment', status: 400 };
  }

  const reason =
    typeof input.reason === 'string' && input.reason.trim()
      ? input.reason.trim().slice(0, 500)
      : null;

  try {
    await query(
      `INSERT INTO album_comment_reports (comment_id, user_id, reason)
       VALUES ($1::uuid, $2::uuid, $3)`,
      [input.commentId, input.userId, reason],
      0
    );
    return { reported: true };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    if (code === '23505') {
      return { error: 'Already reported', status: 409, code: 'ALREADY_REPORTED' };
    }
    throw err;
  }
}
