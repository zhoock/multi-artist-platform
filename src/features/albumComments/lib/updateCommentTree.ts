import type { AlbumCommentDto } from '@shared/api/albumComments';

export function mapComments(
  comments: AlbumCommentDto[],
  mapper: (c: AlbumCommentDto) => AlbumCommentDto
): AlbumCommentDto[] {
  return comments.map((root) => {
    const next = mapper(root);
    return {
      ...next,
      replies: next.replies.map((r) => mapper(r)),
    };
  });
}

export function updateCommentInTree(
  comments: AlbumCommentDto[],
  commentId: string,
  patch: Partial<AlbumCommentDto> | ((current: AlbumCommentDto) => AlbumCommentDto)
): AlbumCommentDto[] {
  const apply = (c: AlbumCommentDto): AlbumCommentDto => {
    if (c.id === commentId) {
      return typeof patch === 'function' ? patch(c) : { ...c, ...patch };
    }
    return c;
  };
  return mapComments(comments, apply);
}

export function appendRootComment(
  comments: AlbumCommentDto[],
  comment: AlbumCommentDto
): AlbumCommentDto[] {
  return [comment, ...comments];
}

export function appendReplyComment(
  comments: AlbumCommentDto[],
  rootId: string,
  reply: AlbumCommentDto
): AlbumCommentDto[] {
  return comments.map((root) => {
    if (root.id !== rootId) return root;
    return {
      ...root,
      replies: [...root.replies, reply],
    };
  });
}

export function replaceCommentInTree(
  comments: AlbumCommentDto[],
  updated: AlbumCommentDto
): AlbumCommentDto[] {
  if (!updated.parentId) {
    return comments.map((c) => (c.id === updated.id ? { ...updated, replies: c.replies } : c));
  }
  return comments.map((root) => {
    if (root.id !== updated.parentId) return root;
    return {
      ...root,
      replies: root.replies.map((r) => (r.id === updated.id ? updated : r)),
    };
  });
}
