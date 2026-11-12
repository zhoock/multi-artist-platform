import {
  USER_NOTIFICATIONS_DROPDOWN_LIMIT,
  USER_NOTIFICATIONS_PAGE_LIMIT,
  USER_NOTIFICATIONS_RETENTION_DAYS,
  clampUserNotificationsLimit,
  insertCommentLikeUserNotification,
  listUserNotificationsPage,
  purgeUserNotificationsOlderThanDays,
  resolveCommentNotificationRecipient,
} from '../user-notifications-db';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';

const mockQuery = query as jest.Mock;

describe('user-notifications-db', () => {
  describe('resolveCommentNotificationRecipient', () => {
    test('root comment notifies album artist', () => {
      expect(
        resolveCommentNotificationRecipient({
          actorUserId: 'listener-1',
          artistUserId: 'artist-1',
          parentCommentAuthorUserId: null,
        })
      ).toBe('artist-1');
    });

    test('artist does not notify self on own root comment', () => {
      expect(
        resolveCommentNotificationRecipient({
          actorUserId: 'artist-1',
          artistUserId: 'artist-1',
          parentCommentAuthorUserId: null,
        })
      ).toBeNull();
    });

    test('reply notifies parent comment author', () => {
      expect(
        resolveCommentNotificationRecipient({
          actorUserId: 'user-b',
          artistUserId: 'artist-1',
          parentCommentAuthorUserId: 'user-a',
        })
      ).toBe('user-a');
    });

    test('reply does not notify when replying to self', () => {
      expect(
        resolveCommentNotificationRecipient({
          actorUserId: 'user-a',
          artistUserId: 'artist-1',
          parentCommentAuthorUserId: 'user-a',
        })
      ).toBeNull();
    });
  });

  describe('clampUserNotificationsLimit', () => {
    test('defaults to dropdown limit', () => {
      expect(clampUserNotificationsLimit(undefined, USER_NOTIFICATIONS_DROPDOWN_LIMIT)).toBe(10);
    });

    test('clamps to max 30', () => {
      expect(clampUserNotificationsLimit('99', USER_NOTIFICATIONS_DROPDOWN_LIMIT)).toBe(30);
    });
  });

  describe('listUserNotificationsPage', () => {
    beforeEach(() => {
      mockQuery.mockReset();
    });

    test('requests limit+1 rows for next-page detection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await listUserNotificationsPage({
        userId: 'u1',
        limit: USER_NOTIFICATIONS_PAGE_LIMIT,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['u1', USER_NOTIFICATIONS_PAGE_LIMIT + 1],
        0
      );
    });
  });

  describe('insertCommentLikeUserNotification', () => {
    beforeEach(() => {
      mockQuery.mockReset();
    });

    test('skips self recipient', async () => {
      await insertCommentLikeUserNotification({
        commentId: 'c1',
        recipientUserId: 'u1',
        actorUserId: 'u1',
        artistUserId: 'a1',
        albumId: 'album-1',
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('inserts comment_like with dedupe guard', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ title: 'Rubber Soul' }] })
        .mockResolvedValueOnce({ rows: [{ public_slug: 'beatles' }] })
        .mockResolvedValueOnce({ rows: [] });

      await insertCommentLikeUserNotification({
        commentId: 'c1',
        recipientUserId: 'author-1',
        actorUserId: 'liker-1',
        artistUserId: 'artist-1',
        albumId: 'rubber-soul',
      });

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[2][0]).toContain("type = 'comment_like'");
    });
  });

  describe('purgeUserNotificationsOlderThanDays', () => {
    beforeEach(() => {
      mockQuery.mockReset();
    });

    test('returns deleted row count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '42' }] });
      const deleted = await purgeUserNotificationsOlderThanDays(USER_NOTIFICATIONS_RETENTION_DAYS);
      expect(deleted).toBe(42);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_notifications'),
        [USER_NOTIFICATIONS_RETENTION_DAYS],
        0
      );
    });
  });
});
