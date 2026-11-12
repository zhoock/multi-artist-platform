import { getToken } from './auth';

export const USER_NOTIFICATIONS_API_DROPDOWN_LIMIT = 10;
export const USER_NOTIFICATIONS_API_PAGE_LIMIT = 25;

export type UserNotificationType = 'comment' | 'comment_like';

export type UserNotificationItem = {
  id: string;
  type: UserNotificationType;
  commentId: string;
  albumId: string;
  artistSlug: string;
  albumTitle: string;
  actorUserId: string;
  isRead: boolean;
  createdAt: string;
};

export async function fetchUserNotifications(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{
  notifications: UserNotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}> {
  const token = getToken();
  if (!token) throw new Error('Unauthorized');
  const params = new URLSearchParams();
  const limit = options?.limit ?? USER_NOTIFICATIONS_API_DROPDOWN_LIMIT;
  params.set('limit', String(limit));
  if (options?.cursor?.trim()) params.set('cursor', options.cursor.trim());
  const res = await fetch(`/api/user/notifications?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      notifications?: UserNotificationItem[];
      nextCursor?: string | null;
      unreadCount?: number;
    };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error('Failed to load notifications');
  }
  return {
    notifications: json.data.notifications ?? [],
    nextCursor: json.data.nextCursor ?? null,
    unreadCount: json.data.unreadCount ?? 0,
  };
}

export async function patchUserNotificationRead(id: string): Promise<{ unreadCount: number }> {
  const token = getToken();
  if (!token) throw new Error('Unauthorized');
  const res = await fetch(`/api/user/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isRead: true }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { unreadCount?: number };
  };
  if (!res.ok || !json.success || json.data?.unreadCount === undefined) {
    throw new Error('Failed to update notification');
  }
  return { unreadCount: json.data.unreadCount };
}
