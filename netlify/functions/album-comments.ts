/**
 * Album comments API
 *
 * GET    /api/album-comments?view=summary|list&albumId=&artistSlug=
 * POST   /api/album-comments
 * PATCH  /api/album-comments/:id
 * DELETE /api/album-comments/:id
 * POST   /api/album-comments/:id/like
 * POST   /api/album-comments/:id/report
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessMessageResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  handleError,
  parseJsonBody,
  requireAuth,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import {
  createAlbumComment,
  getAlbumCommentsSummary,
  getCommentById,
  listAlbumCommentsPage,
  normalizeCommentBody,
  reportAlbumComment,
  resolveAlbumCommentContext,
  softDeleteAlbumComment,
  toggleAlbumCommentLike,
  updateAlbumComment,
} from './lib/album-comments';
import {
  insertCommentLikeUserNotification,
  insertCommentUserNotification,
} from './lib/user-notifications-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Route =
  | { kind: 'collection' }
  | { kind: 'comment'; commentId: string; action?: 'like' | 'report' };

function normalizeApiPath(event: HandlerEvent): string {
  const raw = event.path ?? '';
  return raw
    .replace(/\/\.netlify\/functions\/album-comments/g, '')
    .replace(/^\/api\/album-comments/, '/api/album-comments');
}

function parseRoute(event: HandlerEvent): Route {
  const path = normalizeApiPath(event);
  const suffix = path.replace(/^\/api\/album-comments\/?/, '');
  if (!suffix) return { kind: 'collection' };
  const parts = suffix.split('/').filter(Boolean);
  const [maybeId, maybeAction] = parts;
  if (!maybeId || !UUID_RE.test(maybeId)) {
    return { kind: 'collection' };
  }
  if (maybeAction === 'like' || maybeAction === 'report') {
    return { kind: 'comment', commentId: maybeId, action: maybeAction };
  }
  if (!maybeAction) {
    return { kind: 'comment', commentId: maybeId };
  }
  return { kind: 'collection' };
}

function readAlbumQuery(event: HandlerEvent): { albumId: string; artistSlug: string } {
  const q = event.queryStringParameters ?? {};
  const albumId = (q.albumId ?? q.album_id ?? '').toString().trim();
  const artistSlug = (q.artistSlug ?? q.artist_slug ?? q.artist ?? '').toString().trim();
  return { albumId, artistSlug };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const route = parseRoute(event);
  const viewerUserId = getUserIdFromEvent(event);

  try {
    if (route.kind === 'collection' && event.httpMethod === 'GET') {
      const { albumId, artistSlug } = readAlbumQuery(event);
      if (!albumId || !artistSlug) {
        return createErrorResponse(400, 'albumId and artistSlug are required');
      }
      const ctx = await resolveAlbumCommentContext({ albumId, artistSlug });
      if (!ctx) {
        return createErrorResponse(404, 'Album not found', undefined, { code: 'NOT_FOUND' });
      }

      const view = (event.queryStringParameters?.view ?? 'list').toString();
      if (view === 'summary') {
        const summary = await getAlbumCommentsSummary(ctx);
        return createSuccessResponse({ summary, artistUserId: ctx.artistUserId });
      }

      const cursor = event.queryStringParameters?.cursor?.toString();
      const page = await listAlbumCommentsPage({
        ctx,
        viewerUserId,
        cursor,
      });
      return createSuccessResponse({ ...page, artistUserId: ctx.artistUserId });
    }

    if (route.kind === 'collection' && event.httpMethod === 'POST') {
      const userId = requireAuth(event);
      if (!userId) return unauthorizedFromAuthHeader(event);

      const body = parseJsonBody<{
        albumId?: string;
        artistSlug?: string;
        body?: string;
        parentId?: string | null;
      }>(event.body, {});

      const albumId = typeof body.albumId === 'string' ? body.albumId.trim() : '';
      const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug.trim() : '';
      if (!albumId || !artistSlug) {
        return createErrorResponse(400, 'albumId and artistSlug are required');
      }

      const normalized = normalizeCommentBody(body.body);
      if (!normalized.ok) {
        return createErrorResponse(400, 'Invalid comment body');
      }

      const ctx = await resolveAlbumCommentContext({ albumId, artistSlug });
      if (!ctx) {
        return createErrorResponse(404, 'Album not found', undefined, { code: 'NOT_FOUND' });
      }

      let parentId: string | null = null;
      let parentCommentAuthorUserId: string | null = null;
      if (body.parentId != null && body.parentId !== '') {
        if (typeof body.parentId !== 'string' || !UUID_RE.test(body.parentId.trim())) {
          return createErrorResponse(400, 'Invalid parentId');
        }
        parentId = body.parentId.trim();
        const parentRow = await getCommentById(parentId);
        if (!parentRow || parentRow.deleted_at) {
          return createErrorResponse(404, 'Parent comment not found');
        }
        parentCommentAuthorUserId = parentRow.user_id;
      }

      const created = await createAlbumComment({
        ctx,
        userId,
        body: normalized.body,
        parentId,
        viewerUserId: userId,
      });
      if ('error' in created) {
        return createErrorResponse(created.status, created.error);
      }

      try {
        await insertCommentUserNotification({
          ctx,
          commentId: created.comment.id,
          actorUserId: userId,
          parentCommentAuthorUserId,
        });
      } catch (notifyErr) {
        console.error('album-comments: user notification insert failed', notifyErr);
      }

      return createSuccessResponse({ comment: created.comment }, 201);
    }

    if (route.kind === 'comment' && route.action === 'like' && event.httpMethod === 'POST') {
      const userId = requireAuth(event);
      if (!userId) return unauthorizedFromAuthHeader(event);

      const result = await toggleAlbumCommentLike({
        commentId: route.commentId,
        userId,
        viewerUserId: userId,
      });
      if ('error' in result) {
        return createErrorResponse(result.status, result.error);
      }

      if (result.createdLike) {
        try {
          const likedComment = await getCommentById(route.commentId);
          if (likedComment && !likedComment.deleted_at) {
            await insertCommentLikeUserNotification({
              commentId: route.commentId,
              recipientUserId: likedComment.user_id,
              actorUserId: userId,
              artistUserId: likedComment.artist_user_id,
              albumId: likedComment.album_id,
            });
          }
        } catch (notifyErr) {
          console.error('album-comments: comment_like notification insert failed', notifyErr);
        }
      }

      const { createdLike: _createdLike, ...payload } = result;
      return createSuccessResponse(payload);
    }

    if (route.kind === 'comment' && route.action === 'report' && event.httpMethod === 'POST') {
      const userId = requireAuth(event);
      if (!userId) return unauthorizedFromAuthHeader(event);

      const body = parseJsonBody<{ reason?: string }>(event.body, {});
      const result = await reportAlbumComment({
        commentId: route.commentId,
        userId,
        reason: body.reason,
      });
      if ('error' in result) {
        return createErrorResponse(result.status, result.error, undefined, {
          code: result.code,
        });
      }
      return createSuccessMessageResponse('Report submitted');
    }

    if (route.kind === 'comment' && !route.action && event.httpMethod === 'PATCH') {
      const userId = requireAuth(event);
      if (!userId) return unauthorizedFromAuthHeader(event);

      const body = parseJsonBody<{ body?: string }>(event.body, {});
      const normalized = normalizeCommentBody(body.body);
      if (!normalized.ok) {
        return createErrorResponse(400, 'Invalid comment body');
      }

      const updated = await updateAlbumComment({
        commentId: route.commentId,
        userId,
        body: normalized.body,
        viewerUserId: userId,
      });
      if ('error' in updated) {
        return createErrorResponse(updated.status, updated.error);
      }
      return createSuccessResponse({ comment: updated.comment });
    }

    if (route.kind === 'comment' && !route.action && event.httpMethod === 'DELETE') {
      const userId = requireAuth(event);
      if (!userId) return unauthorizedFromAuthHeader(event);

      const deleted = await softDeleteAlbumComment({
        commentId: route.commentId,
        userId,
        viewerUserId: userId,
      });
      if ('error' in deleted) {
        return createErrorResponse(deleted.status, deleted.error);
      }
      return createSuccessResponse({ comment: deleted.comment });
    }

    return createErrorResponse(405, 'Method not allowed');
  } catch (error) {
    return handleError(error, 'album-comments', 'Album comments request failed');
  }
};
