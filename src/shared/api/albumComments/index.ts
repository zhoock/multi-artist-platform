import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader, getToken } from '@shared/lib/auth';
import type { AlbumCommentDto, AlbumCommentsPageDto, AlbumCommentsSummaryDto } from './types';

export type { AlbumCommentDto, AlbumCommentsPageDto, AlbumCommentsSummaryDto } from './types';

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error?: string; code?: string };

async function parseApi<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !payload.success) {
    const message =
      payload.success === false && payload.error
        ? payload.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload.data;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getToken()) {
    Object.assign(headers, getAuthHeader());
  }
  return headers;
}

export async function fetchAlbumCommentsSummary(params: {
  albumId: string;
  artistSlug: string;
}): Promise<{ summary: AlbumCommentsSummaryDto; artistUserId: string }> {
  const search = new URLSearchParams({
    view: 'summary',
    albumId: params.albumId,
    artistSlug: params.artistSlug,
  });
  const response = await fetchWithAuthSession(`/api/album-comments?${search.toString()}`, {
    headers: authHeaders(),
  });
  return parseApi<{ summary: AlbumCommentsSummaryDto; artistUserId: string }>(response);
}

export async function fetchAlbumCommentsPage(params: {
  albumId: string;
  artistSlug: string;
  cursor?: string | null;
}): Promise<AlbumCommentsPageDto> {
  const search = new URLSearchParams({
    view: 'list',
    albumId: params.albumId,
    artistSlug: params.artistSlug,
  });
  if (params.cursor) search.set('cursor', params.cursor);
  const response = await fetchWithAuthSession(`/api/album-comments?${search.toString()}`, {
    headers: authHeaders(),
  });
  return parseApi<AlbumCommentsPageDto>(response);
}

export async function createAlbumComment(params: {
  albumId: string;
  artistSlug: string;
  body: string;
  parentId?: string | null;
}): Promise<AlbumCommentDto> {
  const response = await fetchWithAuthSession('/api/album-comments', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      albumId: params.albumId,
      artistSlug: params.artistSlug,
      body: params.body,
      parentId: params.parentId ?? null,
    }),
  });
  const data = await parseApi<{ comment: AlbumCommentDto }>(response);
  return data.comment;
}

export async function updateAlbumComment(params: {
  commentId: string;
  body: string;
}): Promise<AlbumCommentDto> {
  const response = await fetchWithAuthSession(`/api/album-comments/${params.commentId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ body: params.body }),
  });
  const data = await parseApi<{ comment: AlbumCommentDto }>(response);
  return data.comment;
}

export async function deleteAlbumComment(commentId: string): Promise<AlbumCommentDto> {
  const response = await fetchWithAuthSession(`/api/album-comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await parseApi<{ comment: AlbumCommentDto }>(response);
  return data.comment;
}

export async function toggleAlbumCommentLike(
  commentId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const response = await fetchWithAuthSession(`/api/album-comments/${commentId}/like`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseApi<{ liked: boolean; likeCount: number }>(response);
}

export async function reportAlbumComment(commentId: string, reason?: string): Promise<void> {
  const response = await fetchWithAuthSession(`/api/album-comments/${commentId}/report`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (!response.ok) {
    await parseApi(response);
  }
}
