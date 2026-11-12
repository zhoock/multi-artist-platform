/**
 * Regression: root album comment creates user notification for album owner.
 */

import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../album-comments', () => {
  const actual = jest.requireActual('../album-comments') as typeof import('../album-comments');
  return {
    ...actual,
    resolveAlbumCommentContext: jest.fn(),
    createAlbumComment: jest.fn(),
    getCommentById: jest.fn(),
    normalizeCommentBody: actual.normalizeCommentBody,
  };
});

jest.mock('../user-notifications-db', () => ({
  insertCommentUserNotification: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(() => 'listener-user-id'),
  };
});

import { handler } from '../../album-comments';
import * as albumCommentsLib from '../album-comments';
import { insertCommentUserNotification } from '../user-notifications-db';

const mockResolveCtx = albumCommentsLib.resolveAlbumCommentContext as jest.MockedFunction<
  typeof albumCommentsLib.resolveAlbumCommentContext
>;
const mockCreate = albumCommentsLib.createAlbumComment as jest.MockedFunction<
  typeof albumCommentsLib.createAlbumComment
>;
const mockInsertNotif = insertCommentUserNotification as jest.MockedFunction<
  typeof insertCommentUserNotification
>;

const ARTIST_USER = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const COMMENT_ID = '73d67361-3302-4a8c-9d1d-969dba4e2d82';

function postCommentEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/album-comments',
    headers: { authorization: 'Bearer test' },
    body: JSON.stringify({
      albumId: 'rubber-soul',
      artistSlug: 'beatles',
      body: 'Hello from listener',
    }),
    queryStringParameters: {},
    isBase64Encoded: false,
  } as HandlerEvent;
}

describe('album-comments user notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCtx.mockResolvedValue({
      albumId: 'rubber-soul',
      artistUserId: ARTIST_USER,
      artistSlug: 'beatles',
    });
    mockCreate.mockResolvedValue({
      comment: {
        id: COMMENT_ID,
        parentId: null,
        body: 'Hello from listener',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        isEdited: false,
        author: {
          userId: 'listener-user-id',
          displayName: 'Listener',
          avatarPath: null,
          isArtist: false,
          publicSlug: null,
        },
        likeCount: 0,
        likedByViewer: false,
        replies: [],
      },
    });
    mockInsertNotif.mockResolvedValue(undefined);
  });

  it('creates notification for album owner after root comment', async () => {
    const res = await handler(postCommentEvent(), {} as never);
    expect(res.statusCode).toBe(201);

    expect(mockInsertNotif).toHaveBeenCalledTimes(1);
    expect(mockInsertNotif).toHaveBeenCalledWith({
      ctx: {
        albumId: 'rubber-soul',
        artistUserId: ARTIST_USER,
        artistSlug: 'beatles',
      },
      commentId: COMMENT_ID,
      actorUserId: 'listener-user-id',
      parentCommentAuthorUserId: null,
    });
  });

  it('notification failure still returns 201 for comment', async () => {
    mockInsertNotif.mockRejectedValue(new Error('relation "user_notifications" does not exist'));

    const res = await handler(postCommentEvent(), {} as never);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).success).toBe(true);
  });
});
