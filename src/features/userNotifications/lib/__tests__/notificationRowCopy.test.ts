import {
  notificationRowBody,
  notificationRowTitle,
  type UserNotificationRowCopy,
} from '../notificationRowCopy';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

const copy: UserNotificationRowCopy = {
  commentTitle: 'New comment',
  commentBodyTemplate: 'On album «{{title}}»',
  likeTitle: 'New like',
  likeBodyTemplate: 'Someone liked your comment on «{{title}}»',
};

const base: UserNotificationItem = {
  id: 'n1',
  type: 'comment',
  commentId: 'c1',
  albumId: '23',
  artistSlug: 'beatles',
  albumTitle: 'Rubber Soul',
  actorUserId: 'a1',
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe('notificationRowCopy', () => {
  test('comment_like uses like strings', () => {
    const item = { ...base, type: 'comment_like' as const };
    expect(notificationRowTitle(item, copy)).toBe('New like');
    expect(notificationRowBody(item, copy)).toBe('Someone liked your comment on «Rubber Soul»');
  });
});
