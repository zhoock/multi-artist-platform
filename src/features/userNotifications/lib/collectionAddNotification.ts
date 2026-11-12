import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

export function isCollectionAddPublicActor(notification: UserNotificationItem): boolean {
  return (
    notification.type === 'collection_add' &&
    Boolean(notification.artistSlug?.trim() && notification.actorDisplayName?.trim())
  );
}

export function formatCollectionAddNotificationBody(
  notification: UserNotificationItem,
  listenerBody: string,
  artistBodyTemplate: string
): string {
  if (isCollectionAddPublicActor(notification)) {
    const name = notification.actorDisplayName?.trim() || '';
    return artistBodyTemplate.replace('{{name}}', name);
  }
  return listenerBody;
}
