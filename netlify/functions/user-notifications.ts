/**
 * GET   /api/user/notifications — paginated list + unreadCount
 * PATCH /api/user/notifications/:id — { "isRead": true }
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  handleError,
  parseJsonBody,
  requireAuth,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import {
  clampUserNotificationsLimit,
  countUnreadUserNotifications,
  listUserNotificationsPage,
  mapUserNotificationRow,
  markUserNotificationRead,
  USER_NOTIFICATIONS_DROPDOWN_LIMIT,
} from './lib/user-notifications-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePath(event: HandlerEvent): string {
  let p = event.path || '';
  const fnIdx = p.indexOf('/.netlify/functions/user-notifications');
  if (fnIdx >= 0) {
    p = p.slice(fnIdx + '/.netlify/functions/user-notifications'.length) || '/';
  } else {
    p = p.replace(/^\/api\/user\/notifications/, '') || '/';
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const userId = requireAuth(event);
  if (!userId) return unauthorizedFromAuthHeader(event);

  const path = normalizePath(event);
  const idMatch = path.match(/^\/([0-9a-f-]{36})\/?$/i);
  const notificationId = idMatch?.[1] ?? null;

  if (event.httpMethod === 'GET') {
    if (path !== '/' && path !== '') {
      return createErrorResponse(404, 'Not found');
    }
    try {
      const q = event.queryStringParameters ?? {};
      const limit = clampUserNotificationsLimit(
        q.limit?.toString(),
        USER_NOTIFICATIONS_DROPDOWN_LIMIT
      );
      const cursor = q.cursor?.toString();
      const [page, unreadCount] = await Promise.all([
        listUserNotificationsPage({ userId, limit, cursor }),
        countUnreadUserNotifications(userId),
      ]);
      return createSuccessResponse({
        notifications: page.notifications.map(mapUserNotificationRow),
        nextCursor: page.nextCursor,
        unreadCount,
      });
    } catch (error) {
      return handleError(error, 'user-notifications', 'Server error');
    }
  }

  if (event.httpMethod === 'PATCH' && notificationId && UUID_RE.test(notificationId)) {
    const body = parseJsonBody<{ isRead?: boolean }>(event.body, {});
    if (body.isRead !== true) {
      return createErrorResponse(400, 'Only isRead: true is supported');
    }
    try {
      await markUserNotificationRead(userId, notificationId);
      const unreadCount = await countUnreadUserNotifications(userId);
      return createSuccessResponse({ unreadCount });
    } catch (error) {
      return handleError(error, 'user-notifications-patch', 'Server error');
    }
  }

  return createErrorResponse(404, 'Not found');
};
