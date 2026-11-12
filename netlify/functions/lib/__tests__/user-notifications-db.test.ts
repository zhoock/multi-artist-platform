import {
  USER_NOTIFICATIONS_DROPDOWN_LIMIT,
  USER_NOTIFICATIONS_PAGE_LIMIT,
  USER_NOTIFICATIONS_RETENTION_DAYS,
  clampUserNotificationsLimit,
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
