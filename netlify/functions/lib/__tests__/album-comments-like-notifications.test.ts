/**
 * POST like creates comment_like notification for comment author.
 */

import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../album-comments', () => {
  const actual = jest.requireActual('../album-comments') as typeof import('../album-comments');
  return {
    ...actual,
    toggleAlbumCommentLike: jest.fn(),
    getCommentById: jest.fn(),
  };
});

jest.mock('../user-notifications-db', () => ({
  insertCommentUserNotification: jest.fn(),
  insertCommentLikeUserNotification: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(() => 'liker-user-id'),
  };
});

import { handler } from '../../album-comments';
import * as albumCommentsLib from '../album-comments';
import { insertCommentLikeUserNotification } from '../user-notifications-db';

const mockToggle = albumCommentsLib.toggleAlbumCommentLike as jest.MockedFunction<
  typeof albumCommentsLib.toggleAlbumCommentLike
>;
const mockGetComment = albumCommentsLib.getCommentById as jest.MockedFunction<
  typeof albumCommentsLib.getCommentById
>;
const mockInsertLikeNotif = insertCommentLikeUserNotification as jest.MockedFunction<
  typeof insertCommentLikeUserNotification
>;

const COMMENT_ID = '73d67361-3302-4a8c-9d1d-969dba4e2d82';

function likeEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: `/.netlify/functions/album-comments/${COMMENT_ID}/like`,
    headers: { authorization: 'Bearer test' },
    body: null,
    queryStringParameters: {},
    isBase64Encoded: false,
  } as HandlerEvent;
}

describe('album-comments like notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('inserts comment_like when like is newly created', async () => {
    mockToggle.mockResolvedValue({ liked: true, likeCount: 1, createdLike: true });
    mockGetComment.mockResolvedValue({
      id: COMMENT_ID,
      user_id: 'author-user-id',
      artist_user_id: 'artist-user-id',
      album_id: 'rubber-soul',
      deleted_at: null,
    });

    const res = await handler(likeEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.data).toEqual({ liked: true, likeCount: 1 });
    expect(body.data.createdLike).toBeUndefined();
    expect(mockInsertLikeNotif).toHaveBeenCalledWith({
      commentId: COMMENT_ID,
      recipientUserId: 'author-user-id',
      actorUserId: 'liker-user-id',
      artistUserId: 'artist-user-id',
      albumId: 'rubber-soul',
    });
  });

  test('skips notification on unlike', async () => {
    mockToggle.mockResolvedValue({ liked: false, likeCount: 0, createdLike: false });

    const res = await handler(likeEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    expect(mockInsertLikeNotif).not.toHaveBeenCalled();
    expect(mockGetComment).not.toHaveBeenCalled();
  });

  test('returns 400 for self-like without notification', async () => {
    mockToggle.mockResolvedValue({
      error: 'Cannot like your own comment',
      status: 400,
    });

    const res = await handler(likeEvent(), {} as never);
    expect(res.statusCode).toBe(400);
    expect(mockInsertLikeNotif).not.toHaveBeenCalled();
  });
});
