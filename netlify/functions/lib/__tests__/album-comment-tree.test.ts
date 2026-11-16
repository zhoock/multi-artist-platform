import { buildNestedCommentTree, pruneCommentForest } from '../album-comment-tree';
import type { AlbumCommentDto } from '../album-comments';

function dto(
  id: string,
  parentId: string | null,
  deletedAt: string | null = null
): AlbumCommentDto {
  return {
    id,
    parentId,
    body: id,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    deletedAt,
    isEdited: false,
    author: {
      userId: 'u',
      displayName: 'U',
      username: null,
      avatarPath: null,
      isArtist: false,
      publicSlug: null,
    },
    likeCount: 0,
    likedByViewer: false,
    replies: [],
  };
}

describe('album-comment-tree', () => {
  test('buildNestedCommentTree nests by parent_id', () => {
    const roots = [dto('root', null)];
    const descendants = [dto('child', 'root'), dto('grand', 'child')];
    const nested = buildNestedCommentTree(roots, descendants);
    expect(nested[0].replies[0].id).toBe('child');
    expect(nested[0].replies[0].replies[0].id).toBe('grand');
  });

  test('pruneCommentForest matches frontend rules', () => {
    const nested = buildNestedCommentTree(
      [dto('root', null, new Date().toISOString())],
      [dto('live', 'root')]
    );
    const pruned = pruneCommentForest(nested);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].body).toBe('');
    expect(pruned[0].replies[0].id).toBe('live');
  });
});
