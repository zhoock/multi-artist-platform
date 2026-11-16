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

function findInReplies(replies: AlbumCommentDto[], id: string): boolean {
  for (const reply of replies) {
    if (reply.id === id) return true;
    if (findInReplies(reply.replies, id)) return true;
  }
  return false;
}

export function findCommentInTree(
  comments: AlbumCommentDto[],
  commentId: string
): LocatedAlbumComment | null {
  const id = commentId.trim();
  for (const root of comments) {
    if (root.id === id) return { rootId: root.id, isReply: false };
    if (findInReplies(root.replies, id)) return { rootId: root.id, isReply: true };
  }
  return null;
}
