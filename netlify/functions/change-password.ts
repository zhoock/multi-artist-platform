/**
 * Netlify Function для смены пароля пользователя
 *
 * POST /api/change-password - смена пароля для текущего пользователя
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import * as bcrypt from 'bcryptjs';
import { query } from './lib/db';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
  parseJsonBody,
  handleError,
} from './lib/api-helpers';
import type { ApiResponse } from './lib/types';
import { validatePassword } from './lib/password-policy';

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordResponse extends ApiResponse<{ message: string }> {}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    const data = parseJsonBody<ChangePasswordRequest>(event.body, {} as ChangePasswordRequest);

    if (!data.currentPassword || !data.newPassword) {
      return createErrorResponse(400, 'Current password and new password are required');
    }

    const passwordError = validatePassword(data.newPassword);
    if (passwordError) {
      return createErrorResponse(400, passwordError.message, undefined, {
        code: passwordError.code,
      });
    }

    if (data.newPassword === data.currentPassword) {
      return createErrorResponse(400, 'New password must be different from current password');
    }

    const result = await query<UserRow>(
      `SELECT id, email, password_hash, is_active
       FROM users
       WHERE id = $1`,
      [userId],
      0
    );

    if (result.rows.length === 0) {
      return createErrorResponse(404, 'User not found');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return createErrorResponse(403, 'User account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(data.currentPassword, user.password_hash);

    if (!isPasswordValid) {
      return createErrorResponse(401, 'Invalid current password', undefined, {
        code: 'INVALID_CREDENTIALS',
      });
    }

    const newPasswordHash = await bcrypt.hash(data.newPassword, 10);

    await query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND is_active = true`,
      [newPasswordHash, userId],
      0
    );

    return createSuccessResponse({
      message: 'Password updated successfully',
    } as ChangePasswordResponse['data']);
  } catch (error) {
    return handleError(error, 'change-password function');
  }
};
