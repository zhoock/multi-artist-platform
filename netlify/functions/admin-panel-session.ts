/**
 * GET  /api/admin/session — verify platform admin (DB); 200 with user or 403
 * POST /api/admin/session — same + issue fresh JWT with correct admin claim
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  requireAuth,
  unauthorizedFromAuthHeader,
  createSuccessResponse,
  createOptionsResponse,
  createErrorResponse,
  CORS_HEADERS,
  handleError,
} from './lib/api-helpers';
import { query } from './lib/db';
import { jwtRoleFromDbUser } from './lib/platform-admin';
import { generateToken } from './lib/jwt';
import { normalizeAccountType } from './lib/account-type';
import { mapAuthUser, type VerificationUserRow } from './lib/email-verification';
import { assertUserIsPlatformAdmin } from './lib/admin-privileges-db';
import { forbiddenAdminPanelResponse } from './lib/admin-http';

type UserMeRow = VerificationUserRow;

function normalizePath(event: HandlerEvent): string {
  let p = event.path || '';
  p = p.replace('/.netlify/functions/admin-panel-session', '');
  p = p.replace(/^\/?\.netlify\/functions\/admin-panel-session/, '');
  p = p.replace(/^\/api\/admin/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  return p === '' ? '/' : p;
}

async function fetchUserForAdminSession(userId: string): Promise<UserMeRow | null> {
  const result = await query<UserMeRow>(
    `SELECT id, email, name, role, is_admin, account_type, is_email_verified, preferred_language
     FROM users
     WHERE id = $1::uuid AND is_active = true`,
    [userId],
    0
  );
  return result.rows[0] ?? null;
}

async function handleSession(
  event: HandlerEvent,
  options: { issueToken: boolean }
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const user = await fetchUserForAdminSession(userId);
  if (!user) {
    return forbiddenAdminPanelResponse(event);
  }

  const allowed = await assertUserIsPlatformAdmin(userId);
  if (!allowed) {
    return forbiddenAdminPanelResponse(event);
  }

  const mapped = mapAuthUser(user);
  if (!options.issueToken) {
    return createSuccessResponse({ allowed: true, user: mapped });
  }

  const jwtRole = jwtRoleFromDbUser({ role: user.role, is_admin: user.is_admin === true });
  const accountType = normalizeAccountType(user.account_type);
  const token = generateToken(user.id, user.email, jwtRole, accountType);

  return createSuccessResponse({ allowed: true, token, user: mapped });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const path = normalizePath(event);
  if (path !== '/session' && !path.endsWith('/session')) {
    return createErrorResponse(404, 'Not found', CORS_HEADERS);
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleSession(event, { issueToken: false });
    }
    if (event.httpMethod === 'POST') {
      return await handleSession(event, { issueToken: true });
    }
    return createErrorResponse(405, 'Method not allowed', CORS_HEADERS);
  } catch (error) {
    return handleError(error, 'admin-panel-session', 'Server error');
  }
};
