import type { AlbumCommentDto } from '@shared/api/albumComments';
import { mapCommentTreeDeep } from './commentTreePrune';

export function updateCommentInTree(
  comments: AlbumCommentDto[],
  commentId: string,
  patch: Partial<AlbumCommentDto> | ((current: AlbumCommentDto) => AlbumCommentDto)
): AlbumCommentDto[] {
  return mapCommentTreeDeep(comments, (c) => {
    if (c.id !== commentId) return c;
    return typeof patch === 'function' ? patch(c) : { ...c, ...patch };
  });
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
  return mapCommentTreeDeep(comments, (c) =>
    c.id === updated.id ? { ...updated, replies: c.replies } : c
  );
}

export function findCommentRootId(comments: AlbumCommentDto[], commentId: string): string | null {
  for (const root of comments) {
    if (root.id === commentId) return root.id;
    if (commentExistsInReplies(root.replies, commentId)) return root.id;
  }
  return null;
}

function commentExistsInReplies(replies: AlbumCommentDto[], commentId: string): boolean {
  for (const reply of replies) {
    if (reply.id === commentId) return true;
    if (commentExistsInReplies(reply.replies, commentId)) return true;
  }
  return false;
}

function findCommentInReplies(
  replies: AlbumCommentDto[],
  commentId: string
): AlbumCommentDto | null {
  for (const reply of replies) {
    if (reply.id === commentId) return reply;
    const nested = findCommentInReplies(reply.replies, commentId);
    if (nested) return nested;
  }
  return null;
}

export function findAlbumCommentById(
  comments: AlbumCommentDto[],
  commentId: string
): AlbumCommentDto | null {
  const id = commentId.trim();
  for (const root of comments) {
    if (root.id === id) return root;
    const inReplies = findCommentInReplies(root.replies, id);
    if (inReplies) return inReplies;
  }
  return null;
}
