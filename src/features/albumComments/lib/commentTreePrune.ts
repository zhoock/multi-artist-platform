import type { AlbumCommentDto } from '@shared/api/albumComments';

const DELETED_PLACEHOLDER_AUTHOR: AlbumCommentDto['author'] = {
  userId: '',
  displayName: '',
  username: null,
  avatarPath: null,
  isArtist: false,
  publicSlug: null,
};

export function toDeletedPlaceholder(comment: AlbumCommentDto): AlbumCommentDto {
  return {
    ...comment,
    body: '',
    isEdited: false,
    likeCount: 0,
    likedByViewer: false,
    author: { ...DELETED_PLACEHOLDER_AUTHOR },
  };
}

export function markCommentDeleted(
  comment: AlbumCommentDto,
  deletedAt: string = new Date().toISOString()
): AlbumCommentDto {
  return {
    ...comment,
    deletedAt,
  };
}

function pruneNode(node: AlbumCommentDto): AlbumCommentDto | null {
  const prunedReplies = node.replies
    .map(pruneNode)
    .filter((child): child is AlbumCommentDto => child !== null);

  if (!node.deletedAt) {
    return { ...node, replies: prunedReplies };
  }

  if (prunedReplies.length === 0) {
    return null;
  }

  return toDeletedPlaceholder({ ...node, replies: prunedReplies });
}

/** Drops deleted nodes unless they still anchor visible descendants. */
export function pruneCommentForest(roots: AlbumCommentDto[]): AlbumCommentDto[] {
  return roots.map(pruneNode).filter((root): root is AlbumCommentDto => root !== null);
}

export function applyCommentDeleteToForest(
  comments: AlbumCommentDto[],
  commentId: string,
  deletedAt: string = new Date().toISOString()
): AlbumCommentDto[] {
  const marked = mapCommentTreeDeep(comments, (c) =>
    c.id === commentId ? markCommentDeleted(c, deletedAt) : c
  );
  return pruneCommentForest(marked);
}

export function mapCommentTreeDeep(
  comments: AlbumCommentDto[],
  mapper: (comment: AlbumCommentDto) => AlbumCommentDto
): AlbumCommentDto[] {
  const mapOne = (comment: AlbumCommentDto): AlbumCommentDto => {
    const next = mapper(comment);
    return {
      ...next,
      replies: next.replies.map(mapOne),
    };
  };
  return comments.map(mapOne);
}
