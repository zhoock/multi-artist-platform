import type { AlbumCommentDto } from '@shared/api/albumComments';
import {
  albumCommentDomId,
  findCommentInTree,
  isAlbumCommentDeepLinkId,
  readAlbumCommentIdFromSearchParams,
} from '../albumCommentDeepLink';

const COMMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeRoot(id: string, replies: AlbumCommentDto[] = []): AlbumCommentDto {
  return {
    id,
    parentId: null,
    body: 'x',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    isEdited: false,
    author: {
      userId: 'u',
      displayName: 'U',
      avatarPath: null,
      isArtist: false,
      publicSlug: null,
    },
    likeCount: 0,
    likedByViewer: false,
    replies,
  };
}

describe('albumCommentDeepLink', () => {
  test('readAlbumCommentIdFromSearchParams accepts UUID comment id', () => {
    const params = new URLSearchParams({ comment: COMMENT_ID });
    expect(readAlbumCommentIdFromSearchParams(params)).toBe(COMMENT_ID);
    expect(readAlbumCommentIdFromSearchParams(new URLSearchParams({ comment: 'not-uuid' }))).toBe(
      null
    );
  });

  test('isAlbumCommentDeepLinkId', () => {
    expect(isAlbumCommentDeepLinkId(COMMENT_ID)).toBe(true);
    expect(isAlbumCommentDeepLinkId('')).toBe(false);
  });

  test('findCommentInTree locates root and reply', () => {
    const reply = makeRoot('reply-1');
    reply.parentId = 'root-1';
    const tree = [makeRoot('root-1', [reply])];
    expect(findCommentInTree(tree, 'root-1')).toEqual({ rootId: 'root-1', isReply: false });
    expect(findCommentInTree(tree, 'reply-1')).toEqual({ rootId: 'root-1', isReply: true });
    expect(findCommentInTree(tree, 'missing')).toBeNull();
  });

  test('albumCommentDomId', () => {
    expect(albumCommentDomId(COMMENT_ID)).toBe(`album-comment-${COMMENT_ID}`);
  });
});
