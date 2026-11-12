import { markUnreadListenerCollectionAddsAsRead } from '../markUnreadListenerCollectionAddsAsRead';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

const patchMock = jest.fn();

jest.mock('@shared/lib/userNotificationsApi', () => ({
  patchUserNotificationRead: (...args: unknown[]) => patchMock(...args),
}));

const listenerCollectionAdd: UserNotificationItem = {
  id: 'n-listener',
  type: 'collection_add',
  commentId: null,
  albumId: null,
  artistSlug: null,
  albumTitle: null,
  actorUserId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
};

const artistCollectionAdd: UserNotificationItem = {
  id: 'n-artist',
  type: 'collection_add',
  commentId: null,
  albumId: null,
  artistSlug: 'beatles',
  albumTitle: null,
  actorDisplayName: 'Beatles',
  actorUserId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
};

const unreadComment: UserNotificationItem = {
  id: 'n-comment',
  type: 'comment',
  commentId: 'c1',
  albumId: 'a1',
  artistSlug: 'beatles',
  albumTitle: 'Album',
  actorUserId: 'u1',
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe('markUnreadListenerCollectionAddsAsRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    patchMock.mockResolvedValue({ unreadCount: 1 });
  });

  test('patches only unread listener collection_add notifications', async () => {
    const result = await markUnreadListenerCollectionAddsAsRead([
      listenerCollectionAdd,
      artistCollectionAdd,
      unreadComment,
    ]);

    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledWith('n-listener');
    expect(result.unreadCount).toBe(1);
    expect(result.notifications.find((n) => n.id === 'n-listener')?.isRead).toBe(true);
    expect(result.notifications.find((n) => n.id === 'n-artist')?.isRead).toBe(false);
    expect(result.notifications.find((n) => n.id === 'n-comment')?.isRead).toBe(false);
  });

  test('returns unchanged list when nothing to mark', async () => {
    const items = [{ ...listenerCollectionAdd, isRead: true }, unreadComment];
    const result = await markUnreadListenerCollectionAddsAsRead(items);

    expect(patchMock).not.toHaveBeenCalled();
    expect(result.unreadCount).toBeNull();
    expect(result.notifications).toEqual(items);
  });
});
