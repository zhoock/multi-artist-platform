import type { AlbumCommentDto } from '@shared/api/albumComments';
import { applyCommentDeleteToForest, pruneCommentForest } from '../commentTreePrune';

function node(
  id: string,
  options: {
    deletedAt?: string | null;
    replies?: AlbumCommentDto[];
    parentId?: string | null;
  } = {}
): AlbumCommentDto {
  return {
    id,
    parentId: options.parentId ?? null,
    body: `body-${id}`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    deletedAt: options.deletedAt ?? null,
    isEdited: false,
    author: {
      userId: `u-${id}`,
      displayName: `User ${id}`,
      username: `user_${id}`,
      avatarPath: null,
      isArtist: false,
      publicSlug: null,
    },
    likeCount: 0,
    likedByViewer: false,
    replies: options.replies ?? [],
  };
}

describe('commentTreePrune', () => {
  test('removes deleted root without replies', () => {
    const roots = [node('a', { deletedAt: new Date().toISOString() })];
    expect(pruneCommentForest(roots)).toEqual([]);
  });

  test('keeps deleted root when a live reply exists', () => {
    const roots = [
      node('a', {
        deletedAt: new Date().toISOString(),
        replies: [node('b', { parentId: 'a' })],
      }),
    ];
    const result = pruneCommentForest(roots);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeTruthy();
    expect(result[0].body).toBe('');
    expect(result[0].author.displayName).toBe('');
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies[0].id).toBe('b');
  });

  test('removes deleted reply without descendants', () => {
    const roots = [
      node('a', {
        replies: [node('b', { parentId: 'a', deletedAt: new Date().toISOString() })],
      }),
    ];
    expect(pruneCommentForest(roots)[0].replies).toHaveLength(0);
  });

  test('removes entire branch when last live reply is deleted', () => {
    const roots = [
      node('a', {
        deletedAt: new Date().toISOString(),
        replies: [node('b', { parentId: 'a' })],
      }),
    ];
    const deletedAt = new Date().toISOString();
    const next = applyCommentDeleteToForest(roots, 'b', deletedAt);
    expect(next).toEqual([]);
  });

  test('keeps deleted chain required to reach live reply', () => {
    const roots = [
      node('a', {
        deletedAt: new Date().toISOString(),
        replies: [
          node('b', {
            parentId: 'a',
            deletedAt: new Date().toISOString(),
            replies: [node('c', { parentId: 'b' })],
          }),
        ],
      }),
    ];
    const result = pruneCommentForest(roots);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result[0].replies[0].id).toBe('b');
    expect(result[0].replies[0].replies[0].id).toBe('c');
    expect(result[0].replies[0].replies[0].deletedAt).toBeNull();
  });

  test('drops deleted nodes when no live descendants remain in deep tree', () => {
    const roots = [
      node('a', {
        deletedAt: new Date().toISOString(),
        replies: [
          node('b', {
            parentId: 'a',
            deletedAt: new Date().toISOString(),
          }),
        ],
      }),
    ];
    expect(pruneCommentForest(roots)).toEqual([]);
  });

  test('markCommentDeleted does not prune by itself', () => {
    const roots = [node('a')];
    const marked = applyCommentDeleteToForest(roots, 'a', new Date().toISOString());
    expect(marked).toEqual([]);
  });
});
