import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { formatAlbumNotificationBody } from './formatAlbumNotificationBody';

export type UserNotificationRowCopy = {
  commentTitle: string;
  commentBodyTemplate: string;
  likeTitle: string;
  likeBodyTemplate: string;
};

export function notificationRowTitle(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  return notification.type === 'comment_like' ? copy.likeTitle : copy.commentTitle;
}

export function notificationRowBody(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  const template =
    notification.type === 'comment_like' ? copy.likeBodyTemplate : copy.commentBodyTemplate;
  return formatAlbumNotificationBody(notification, template);
}
