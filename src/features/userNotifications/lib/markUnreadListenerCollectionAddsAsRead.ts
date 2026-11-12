import {
  patchUserNotificationRead,
  type UserNotificationItem,
} from '@shared/lib/userNotificationsApi';
import { isListenerCollectionAddNotification } from './collectionAddNotification';

export async function markUnreadListenerCollectionAddsAsRead(
  notifications: UserNotificationItem[]
): Promise<{ notifications: UserNotificationItem[]; unreadCount: number | null }> {
  const targets = notifications.filter((n) => !n.isRead && isListenerCollectionAddNotification(n));
  if (targets.length === 0) {
    return { notifications, unreadCount: null };
  }

  let unreadCount: number | null = null;
  const markedIds = new Set<string>();

  for (const item of targets) {
    try {
      const result = await patchUserNotificationRead(item.id);
      unreadCount = result.unreadCount;
      markedIds.add(item.id);
    } catch {
      /* keep local unread state for failed patches */
    }
  }

  const updated = notifications.map((n) => (markedIds.has(n.id) ? { ...n, isRead: true } : n));
  return { notifications: updated, unreadCount };
}
