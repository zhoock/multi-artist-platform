import { updateCommentInTree } from '../updateCommentTree';
import type { AlbumCommentDto } from '@shared/api/albumComments';

function makeComment(
  overrides: Partial<AlbumCommentDto> & Pick<AlbumCommentDto, 'id'>
): AlbumCommentDto {
  return {
    parentId: null,
    body: 'Body',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    isEdited: false,
    likeCount: 0,
    likedByViewer: false,
    author: {
      userId: 'u-1',
      displayName: 'User',
      username: 'user',
      avatarPath: null,
      isArtist: false,
      publicSlug: null,
    },
    replies: [],
    ...overrides,
  };
}

describe('comment like optimistic patch', () => {
  test('toggles likedByViewer and increments likeCount on root comment', () => {
    const tree = [makeComment({ id: 'c-1' })];
    const next = updateCommentInTree(tree, 'c-1', (c) => ({
      ...c,
      likedByViewer: !c.likedByViewer,
      likeCount: c.likedByViewer ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
    }));

    expect(next[0].likedByViewer).toBe(true);
    expect(next[0].likeCount).toBe(1);
  });

  test('toggles likedByViewer on nested reply', () => {
    const tree = [
      makeComment({
        id: 'root',
        replies: [
          makeComment({ id: 'reply', parentId: 'root', likeCount: 2, likedByViewer: true }),
        ],
      }),
    ];

    const next = updateCommentInTree(tree, 'reply', (c) => ({
      ...c,
      likedByViewer: !c.likedByViewer,
      likeCount: c.likedByViewer ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
    }));

    expect(next[0].replies[0].likedByViewer).toBe(false);
    expect(next[0].replies[0].likeCount).toBe(1);
  });
});
