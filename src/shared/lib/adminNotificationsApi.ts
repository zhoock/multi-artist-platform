import { getToken } from './auth';

export type AdminNotificationType = 'copyright_claim';

export type AdminNotificationItem = {
  id: string;
  type: AdminNotificationType;
  title: string | null;
  body: unknown;
  targetType: string;
  targetId: string;
  isRead: boolean;
  createdAt: string;
};

export async function fetchAdminNotifications(): Promise<{
  notifications: AdminNotificationItem[];
  unreadCount: number;
}> {
  const token = getToken();
  if (!token) throw new Error('Unauthorized');
  const res = await fetch('/api/admin/notifications', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { notifications?: AdminNotificationItem[]; unreadCount?: number };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error('Failed to load notifications');
  }
  return {
    notifications: json.data.notifications ?? [],
    unreadCount: json.data.unreadCount ?? 0,
  };
}

export async function patchAdminNotificationRead(id: string): Promise<{ unreadCount: number }> {
  const token = getToken();
  if (!token) throw new Error('Unauthorized');
  const res = await fetch(`/api/admin/notifications/${encodeURIComponent(id)}`, {
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
