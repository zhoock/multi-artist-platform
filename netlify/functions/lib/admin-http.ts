import type { HandlerEvent } from '@netlify/functions';
import {
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
  createErrorResponse,
  CORS_HEADERS,
} from './api-helpers';
import { assertUserIsPlatformAdmin } from './admin-privileges-db';

export async function requirePlatformAdminFromEvent(event: HandlerEvent): Promise<string | null> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return null;
  if (!(await assertUserIsPlatformAdmin(userId))) return null;
  return userId;
}

export function forbiddenAdminPanelResponse(event: HandlerEvent) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }
  return createErrorResponse(403, 'Admin access required', CORS_HEADERS, {
    code: 'ADMIN_ACCESS_REQUIRED',
  });
}
