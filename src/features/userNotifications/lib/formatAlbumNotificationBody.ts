import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

export function formatAlbumNotificationBody(
  notification: UserNotificationItem,
  template: string
): string {
  const title = notification.albumTitle?.trim() || notification.albumId;
  return template.replace('{{title}}', title);
}
