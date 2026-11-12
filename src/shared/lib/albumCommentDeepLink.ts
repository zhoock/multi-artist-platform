import type { AlbumCommentDto } from '@shared/api/albumComments';

/** Query key for deep-linking to a specific album comment on the public album page. */
export const ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM = 'comment';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAlbumCommentDeepLinkId(value: string | null | undefined): value is string {
  const id = value?.trim() ?? '';
  return id.length > 0 && UUID_RE.test(id);
}

export function readAlbumCommentIdFromSearchParams(params: URLSearchParams): string | null {
  const raw = params.get(ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM);
  return isAlbumCommentDeepLinkId(raw) ? raw.trim() : null;
}

export function albumCommentDomId(commentId: string): string {
  return `album-comment-${commentId}`;
}

export type LocatedAlbumComment = {
  rootId: string;
  isReply: boolean;
};

export function findCommentInTree(
  comments: AlbumCommentDto[],
  commentId: string
): LocatedAlbumComment | null {
  const id = commentId.trim();
  for (const root of comments) {
    if (root.id === id) return { rootId: root.id, isReply: false };
    for (const reply of root.replies) {
      if (reply.id === id) return { rootId: root.id, isReply: true };
    }
  }
  return null;
}
