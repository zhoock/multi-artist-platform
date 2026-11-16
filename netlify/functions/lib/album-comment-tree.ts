/**
 * Prune deleted comment nodes unless they anchor live descendants.
 * Mirrors `src/features/albumComments/lib/commentTreePrune.ts` for the API layer.
 */

import type { AlbumCommentDto } from './album-comments';

const DELETED_PLACEHOLDER_AUTHOR: AlbumCommentDto['author'] = {
  userId: '',
  displayName: '',
  username: null,
  avatarPath: null,
  isArtist: false,
  publicSlug: null,
};

function toDeletedPlaceholder(comment: AlbumCommentDto): AlbumCommentDto {
  return {
    ...comment,
    body: '',
    isEdited: false,
    likeCount: 0,
    likedByViewer: false,
    author: { ...DELETED_PLACEHOLDER_AUTHOR },
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

export function pruneCommentForest(roots: AlbumCommentDto[]): AlbumCommentDto[] {
  return roots.map(pruneNode).filter((root): root is AlbumCommentDto => root !== null);
}

export function buildNestedCommentTree(
  roots: AlbumCommentDto[],
  descendants: AlbumCommentDto[]
): AlbumCommentDto[] {
  const byId = new Map<string, AlbumCommentDto>();

  for (const root of roots) {
    byId.set(root.id, { ...root, replies: [] });
  }
  for (const row of descendants) {
    byId.set(row.id, { ...row, replies: [] });
  }

  const rootIds = new Set(roots.map((r) => r.id));

  for (const node of byId.values()) {
    const parentId = node.parentId?.trim() ?? '';
    if (!parentId || rootIds.has(node.id)) continue;

    const parent = byId.get(parentId);
    if (!parent) continue;
    parent.replies.push(node);
  }

  for (const node of byId.values()) {
    node.replies.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    );
  }

  return roots.map((root) => byId.get(root.id) ?? { ...root, replies: [] });
}
