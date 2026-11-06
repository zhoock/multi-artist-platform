/**
 * GET   /api/admin/notifications — list (latest 50) + unreadCount
 * PATCH /api/admin/notifications/:id — { "isRead": true } only
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  CORS_HEADERS,
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  handleError,
  parseJsonBody,
  requireAdmin,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { forbiddenAdminPanelResponse } from './lib/admin-http';
import { query } from './lib/db';

interface NotificationRow {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  target_type: string;
  target_id: string;
  is_read: boolean;
  created_at: Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePath(event: HandlerEvent): string {
  let p = event.path || '';
  const fnIdx = p.indexOf('/.netlify/functions/admin-notifications');
  if (fnIdx >= 0) {
    p = p.slice(fnIdx + '/.netlify/functions/admin-notifications'.length) || '/';
  } else {
    p = p.replace(/^\/api\/admin\/notifications/, '') || '/';
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

function mapNotification(r: NotificationRow) {
  let bodyParsed: unknown = null;
  if (r.body) {
    try {
      bodyParsed = JSON.parse(r.body) as unknown;
    } catch {
      bodyParsed = null;
    }
  }
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: bodyParsed,
    targetType: r.target_type,
    targetId: r.target_id,
    isRead: r.is_read,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

async function countUnread(): Promise<number> {
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM admin_notifications WHERE is_read = false`,
    [],
    0
  );
  return Number.parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const adminId = await requireAdmin(event);
  if (!adminId) {
    return getUserIdFromEvent(event)
      ? forbiddenAdminPanelResponse(event)
      : unauthorizedFromAuthHeader(event);
  }

  const path = normalizePath(event);

  if (event.httpMethod === 'GET') {
    if (path !== '/' && path !== '') {
      return createErrorResponse(404, 'Not found', CORS_HEADERS);
    }
    try {
      const list = await query<NotificationRow>(
        `SELECT id, type, title, body, target_type, target_id, is_read, created_at
         FROM admin_notifications
         ORDER BY created_at DESC
         LIMIT 50`,
        [],
        0
      );
      const unreadCount = await countUnread();
      return createSuccessResponse({
        notifications: list.rows.map(mapNotification),
        unreadCount,
      });
    } catch (error) {
      return handleError(error, 'admin-notifications', 'Server error');
    }
  }

  if (event.httpMethod === 'PATCH') {
    const id = path.replace(/^\//, '').trim();
    if (!UUID_RE.test(id)) {
      return createErrorResponse(404, 'Not found', CORS_HEADERS);
    }

    let body: Record<string, unknown>;
    try {
      body = parseJsonBody<Record<string, unknown>>(event.body, {});
    } catch {
      return createErrorResponse(400, 'Invalid JSON body', CORS_HEADERS, { code: 'INVALID_JSON' });
    }

    const keys = Object.keys(body);
    if (keys.length !== 1 || !keys.includes('isRead')) {
      return createErrorResponse(400, 'Invalid body', CORS_HEADERS, { code: 'UNKNOWN_FIELD' });
    }
    if (body.isRead !== true) {
      return createErrorResponse(400, 'Only isRead: true is supported', CORS_HEADERS, {
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const upd = await query<{ id: string }>(
        `UPDATE admin_notifications SET is_read = true WHERE id = $1::uuid RETURNING id`,
        [id],
        0
      );
      if (upd.rows.length === 0) {
        return createErrorResponse(404, 'Not found', CORS_HEADERS);
      }
      const unreadCount = await countUnread();
      return createSuccessResponse({ ok: true, unreadCount });
    } catch (error) {
      return handleError(error, 'admin-notifications-patch', 'Server error');
    }
  }

  return createErrorResponse(405, 'Method not allowed', CORS_HEADERS);
};
