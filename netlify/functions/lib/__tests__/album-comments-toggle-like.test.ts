/**
 * toggleAlbumCommentLike — self-like guard and like state.
 */

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { toggleAlbumCommentLike } from '../album-comments';

const mockQuery = query as jest.Mock;

const COMMENT_ID = '73d67361-3302-4a8c-9d1d-969dba4e2d82';
const AUTHOR = 'author-user-id';
const LIKER = 'liker-user-id';

function commentRow(authorId = AUTHOR) {
  return {
    id: COMMENT_ID,
    artist_user_id: 'artist-user-id',
    album_id: 'rubber-soul',
    user_id: authorId,
    parent_id: null,
    body: 'Nice',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    name: 'User',
    site_name: null,
    username: null,
    profile_avatar_path: null,
    account_type: null,
    public_slug: null,
  };
}

describe('toggleAlbumCommentLike', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects liking own comment without mutating likes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [commentRow(AUTHOR)] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] });

    const result = await toggleAlbumCommentLike({
      commentId: COMMENT_ID,
      userId: AUTHOR,
      viewerUserId: AUTHOR,
    });

    expect(result).toEqual({ error: 'Cannot like your own comment', status: 400 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('creates like on someone else comment', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [commentRow()] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce({ rows: [{ comment_id: COMMENT_ID }] })
      .mockResolvedValueOnce({ rows: [{ cnt: '1' }] });

    const result = await toggleAlbumCommentLike({
      commentId: COMMENT_ID,
      userId: LIKER,
      viewerUserId: LIKER,
    });

    expect(result).toEqual({ liked: true, likeCount: 1, createdLike: true });
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  test('unlike does not report createdLike', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [commentRow()] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

    const result = await toggleAlbumCommentLike({
      commentId: COMMENT_ID,
      userId: LIKER,
      viewerUserId: LIKER,
    });

    expect(result).toEqual({ liked: false, likeCount: 0, createdLike: false });
  });
});
