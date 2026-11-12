import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { formatCollectionAddNotificationBody } from './collectionAddNotification';
import { formatAlbumNotificationBody } from './formatAlbumNotificationBody';

export type UserNotificationRowCopy = {
  commentTitle: string;
  commentReplyTitle: string;
  commentBodyTemplate: string;
  likeTitle: string;
  likeBodyTemplate: string;
  collectionAddTitle: string;
  collectionAddBody: string;
  collectionAddByArtistBody: string;
};

export function notificationRowTitle(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  if (notification.type === 'collection_add') return copy.collectionAddTitle;
  if (notification.type === 'comment_like') return copy.likeTitle;
  if (notification.type === 'comment_reply') return copy.commentReplyTitle;
  return copy.commentTitle;
}

export function notificationRowBody(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  if (notification.type === 'collection_add') {
    return formatCollectionAddNotificationBody(
      notification,
      copy.collectionAddBody,
      copy.collectionAddByArtistBody
    );
  }
  const template =
    notification.type === 'comment_like' ? copy.likeBodyTemplate : copy.commentBodyTemplate;
  return formatAlbumNotificationBody(notification, template);
}
