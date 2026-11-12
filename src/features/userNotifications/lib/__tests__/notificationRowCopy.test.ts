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
  collectionAddTitle: 'Collection',
  collectionAddBody: 'Another listener added you to their collection',
  collectionAddByArtistBody: '{{name}} added you to their collection',
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

  test('collection_add from listener uses anonymous collection body', () => {
    const item = {
      ...base,
      type: 'collection_add' as const,
      commentId: null,
      albumId: null,
      artistSlug: null,
      albumTitle: null,
      actorUserId: null,
    };
    expect(notificationRowTitle(item, copy)).toBe('Collection');
    expect(notificationRowBody(item, copy)).toBe('Another listener added you to their collection');
  });

  test('collection_add from artist uses artist body with name', () => {
    const item = {
      ...base,
      type: 'collection_add' as const,
      commentId: null,
      albumId: null,
      artistSlug: 'artem-k',
      albumTitle: null,
      actorUserId: null,
      actorDisplayName: 'Artem K.',
    };
    expect(notificationRowBody(item, copy)).toBe('Artem K. added you to their collection');
  });
});
