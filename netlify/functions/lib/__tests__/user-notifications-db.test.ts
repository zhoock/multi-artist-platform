import {
  USER_NOTIFICATIONS_DROPDOWN_LIMIT,
  USER_NOTIFICATIONS_PAGE_LIMIT,
  USER_NOTIFICATIONS_RETENTION_DAYS,
  clampUserNotificationsLimit,
  insertCollectionAddUserNotification,
  insertAlbumPurchaseUserNotification,
  insertCommentLikeUserNotification,
  listUserNotificationsPage,
  mapUserNotificationRow,
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

  describe('insertAlbumPurchaseUserNotification', () => {
    beforeEach(() => {
      mockQuery.mockReset();
    });

    test('inserts album_purchase without actor identity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await insertAlbumPurchaseUserNotification({
        orderId: 'order-1',
        artistUserId: 'artist-1',
        albumSlug: 'rubber-soul',
        artistSlug: 'beatles',
        albumTitle: 'Rubber Soul',
        albumCoverPath: 'cover-key',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'album_purchase'"),
        ['artist-1', 'rubber-soul', 'beatles', 'Rubber Soul', 'order-1', 'cover-key'],
        0
      );
    });

    test('dedupe guard references purchase_order_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await insertAlbumPurchaseUserNotification({
        orderId: 'order-2',
        artistUserId: 'artist-1',
        albumSlug: 'a1',
        artistSlug: 'slug',
        albumTitle: 'Title',
      });
      expect(mockQuery.mock.calls[0][0]).toContain('purchase_order_id = $5::uuid');
    });
  });

  describe('mapUserNotificationRow album_purchase', () => {
    test('hides buyer and exposes album cover metadata', () => {
      const dto = mapUserNotificationRow({
        id: 'n1',
        type: 'album_purchase',
        comment_id: null,
        album_id: 'rubber-soul',
        artist_slug: 'beatles',
        album_title: 'Rubber Soul',
        actor_user_id: null,
        album_cover_path: 'cover-key',
        recipient_user_id: 'artist-1',
        is_read: false,
        created_at: new Date('2026-01-01T12:00:00Z'),
      });
      expect(dto.type).toBe('album_purchase');
      expect(dto.actorUserId).toBeNull();
      expect(dto.albumCoverPath).toBe('cover-key');
      expect(dto.albumCoverOwnerUserId).toBe('artist-1');
      expect(dto.albumTitle).toBe('Rubber Soul');
    });
  });

  describe('insertCollectionAddUserNotification', () => {
    beforeEach(() => {
      mockQuery.mockReset();
    });

    test('inserts listener collection_add without public actor snapshot', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              account_type: 'listener',
              public_slug: null,
              site_name: null,
              name: 'Listener',
              profile_avatar_path: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      await insertCollectionAddUserNotification({
        artistUserId: 'artist-1',
        actorUserId: 'listener-1',
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain("'collection_add'");
      expect(mockQuery.mock.calls[1][1]).toEqual(['artist-1', '', '', '', 'listener-1']);
    });

    test('inserts artist actor snapshot when actor is artist with public slug', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              account_type: 'artist',
              public_slug: 'artem-k',
              site_name: 'Artem K.',
              name: 'Artem',
              profile_avatar_path: 'users/a1/profile/profile-abcd-128.webp',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      await insertCollectionAddUserNotification({
        artistUserId: 'artist-1',
        actorUserId: 'artist-actor-1',
      });

      expect(mockQuery.mock.calls[1][1]).toEqual([
        'artist-1',
        'users/a1/profile/profile-abcd-128.webp',
        'artem-k',
        'Artem K.',
        'artist-actor-1',
      ]);
    });

    test('skips self add', async () => {
      await insertCollectionAddUserNotification({
        artistUserId: 'same',
        actorUserId: 'same',
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('mapUserNotificationRow', () => {
    test('collection_add from listener hides actor identity in API DTO', () => {
      const dto = mapUserNotificationRow({
        id: 'n1',
        type: 'collection_add',
        comment_id: null,
        album_id: '',
        artist_slug: '',
        album_title: '',
        actor_user_id: 'listener-1',
        is_read: false,
        created_at: new Date('2026-01-01T12:00:00Z'),
      });
      expect(dto.actorUserId).toBeNull();
      expect(dto.artistSlug).toBeNull();
      expect(dto.actorDisplayName).toBeNull();
      expect(dto.type).toBe('collection_add');
    });

    test('collection_add from artist exposes public actor snapshot only', () => {
      const dto = mapUserNotificationRow({
        id: 'n2',
        type: 'collection_add',
        comment_id: null,
        album_id: 'users/a1/profile/profile-abcd-128.webp',
        artist_slug: 'artem-k',
        album_title: 'Artem K.',
        actor_user_id: 'artist-actor-1',
        is_read: false,
        created_at: new Date('2026-01-01T12:00:00Z'),
      });
      expect(dto.artistSlug).toBe('artem-k');
      expect(dto.actorDisplayName).toBe('Artem K.');
      expect(dto.actorAvatarPath).toBe('users/a1/profile/profile-abcd-128.webp');
      expect(dto.actorUserId).toBeNull();
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
