import {
  formatCollectionAddNotificationBody,
  isCollectionAddPublicActor,
} from '../collectionAddNotification';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

const base: UserNotificationItem = {
  id: 'n1',
  type: 'collection_add',
  commentId: null,
  albumId: null,
  artistSlug: null,
  albumTitle: null,
  actorUserId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe('collectionAddNotification', () => {
  test('isCollectionAddPublicActor is false for anonymous listener add', () => {
    expect(isCollectionAddPublicActor(base)).toBe(false);
  });

  test('isCollectionAddPublicActor is true when slug and display name are present', () => {
    expect(
      isCollectionAddPublicActor({
        ...base,
        artistSlug: 'artem-k',
        actorDisplayName: 'Artem K.',
      })
    ).toBe(true);
  });

  test('formatCollectionAddNotificationBody picks listener vs artist copy', () => {
    expect(
      formatCollectionAddNotificationBody(base, 'Another listener added you', '{{name}} added you')
    ).toBe('Another listener added you');

    expect(
      formatCollectionAddNotificationBody(
        { ...base, artistSlug: 'artem-k', actorDisplayName: 'Artem K.' },
        'Another listener added you',
        '{{name}} added you'
      )
    ).toBe('Artem K. added you');
  });
});
