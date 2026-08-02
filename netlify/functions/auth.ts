/**
 * Netlify Function для аутентификации пользователей
 *
 * POST /api/auth/register - регистрация нового пользователя
 * POST /api/auth/login - вход пользователя
 * POST /api/auth/forgot-password - запросить ссылку для сброса пароля
 * POST /api/auth/reset-password - установить новый пароль по токену
 * GET  /api/auth/verify-email?token=... - подтверждение email (редирект на фронт)
 * POST /api/auth/resend-verification - повторная отправка (JWT)
 * POST /api/auth/change-verification-email - смена email до верификации (JWT)
 * POST /api/auth/preferred-language - сохранить язык пользователя (JWT)
 * POST /api/auth/upgrade-to-artist - listener → artist (JWT)
 * GET  /api/auth/me - текущий пользователь (JWT)
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { query } from './lib/db';
import { generateToken } from './lib/jwt';
import * as bcrypt from 'bcryptjs';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  CORS_HEADERS,
  parseJsonBody,
  handleError,
  requireAuth,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import type { ApiResponse } from './lib/types';
import {
  assignVerificationToken,
  assertVerificationEmailAllowed,
  mapAuthUser,
  markEmailVerified,
  sendUserVerificationEmail,
  type VerificationUserRow,
} from './lib/email-verification';
import {
  deleteUserAccount,
  DeleteAccountError,
  mapDeleteAccountError,
} from './lib/delete-user-account';
import { buildPublicAppPath } from './lib/public-app-url';
import { normalizeEmailLocale } from './lib/email-locale';
import { updateUserPreferredLanguage } from './lib/user-preferred-language';
import {
  enforceAuthVerificationIpRateLimit,
  enforceIpRateLimit,
  PASSWORD_RESET_CONSUME_IP_LIMIT,
  PASSWORD_RESET_REQUEST_IP_LIMIT,
} from './lib/ip-rate-limit';
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimitOnSuccess,
  loginRateLimitResponse,
} from './lib/login-rate-limit';
import {
  applyPasswordResetForUser,
  assertPasswordResetAllowed,
  assignPasswordResetToken,
  findActiveResetTokenOwner,
  findUserByEmailForReset,
  sendUserPasswordResetEmail,
  validateNewPassword,
} from './lib/password-reset';
import { validatePassword } from './lib/password-policy';
import { normalizeAccountType, type AccountType } from './lib/account-type';

interface UserRow extends VerificationUserRow {
  password_hash: string;
  is_active: boolean;
}

interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  siteName?: string;
  accountType?: AccountType | string;
  preferredLanguage?: string;
}

interface SlugRow {
  public_slug: string;
}

interface UsernameRow {
  username: string;
}

interface LoginRequest {
  email: string;
  password: string;
  preferredLanguage?: string;
}

interface PreferredLanguageRequest {
  preferredLanguage?: string;
}

interface ChangeVerificationEmailRequest {
  email: string;
}

interface DeleteAccountRequest {
  currentPassword: string;
}

interface UpgradeToArtistRequest {
  artistName?: string;
  siteName?: string;
  name?: string;
}

interface ForgotPasswordRequest {
  email?: string;
}

interface ResetPasswordRequest {
  token?: string;
  password?: string;
}

/**
 * Neutral copy returned by /forgot-password regardless of whether an account
 * exists. Identical wording prevents email enumeration via response bodies.
 */
const FORGOT_PASSWORD_NEUTRAL_MESSAGE =
  'If an account with this email exists, we sent a password reset link.';

interface AuthData {
  token: string;
  user: ReturnType<typeof mapAuthUser>;
}

type AuthResponse = ApiResponse<AuthData>;

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'artist';
}

async function generateUniquePublicSlug(
  siteName: string | null | undefined,
  name: string | null | undefined,
  email: string
): Promise<string> {
  const emailLocalPart = email.split('@')[0] || 'artist';
  const baseValue = siteName || name || emailLocalPart;
  const baseSlug = slugify(baseValue);

  const existingSlugs = await query<SlugRow>(
    `SELECT public_slug
     FROM users
     WHERE public_slug = $1
        OR public_slug LIKE $2`,
    [baseSlug, `${baseSlug}-%`],
    0
  );

  const usedSlugs = new Set(
    existingSlugs.rows.map((row) => row.public_slug).filter((slug): slug is string => !!slug)
  );

  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

async function generateUniqueUsername(
  siteName: string | null | undefined,
  name: string | null | undefined,
  email: string
): Promise<string> {
  const emailLocalPart = email.split('@')[0] || 'artist';
  const baseValue = siteName || name || emailLocalPart;
  const baseUsername = slugify(baseValue);

  const existingUsernames = await query<UsernameRow>(
    `SELECT username
     FROM users
     WHERE username = $1
        OR username LIKE $2`,
    [baseUsername, `${baseUsername}-%`],
    0
  );

  const usedUsernames = new Set(
    existingUsernames.rows
      .map((row) => row.username)
      .filter((username): username is string => !!username)
  );

  if (!usedUsernames.has(baseUsername)) {
    return baseUsername;
  }

  let suffix = 2;
  while (usedUsernames.has(`${baseUsername}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseUsername}-${suffix}`;
}

async function fetchUserById(userId: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT id, email, name, password_hash, is_active, role, account_type, is_email_verified, preferred_language
     FROM users
     WHERE id = $1`,
    [userId],
    0
  );
  return result.rows[0] ?? null;
}

function buildAuthPayload(user: UserRow): AuthData {
  const accountType = normalizeAccountType(user.account_type);
  const token = generateToken(
    user.id,
    user.email,
    user.role === 'admin' ? 'admin' : 'user',
    accountType
  );
  return { token, user: mapAuthUser(user) };
}

async function handleVerifyEmailGet(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const token = event.queryStringParameters?.token?.trim();

  if (!token) {
    return {
      statusCode: 302,
      headers: {
        Location: buildPublicAppPath('/email-verification-expired?reason=missing'),
      },
      body: '',
    };
  }

  const result = await query<VerificationUserRow>(
    `SELECT id, email, name, role, account_type, is_email_verified
     FROM users
     WHERE email_verification_token = $1`,
    [token],
    0
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 302,
      headers: {
        Location: buildPublicAppPath('/email-verification-expired?reason=invalid'),
      },
      body: '',
    };
  }

  const user = result.rows[0];

  if (user.is_email_verified) {
    return {
      statusCode: 302,
      headers: { Location: buildPublicAppPath('/email-verified?already=1') },
      body: '',
    };
  }

  const expiryCheck = await query<{ email_verification_expires_at: string | null }>(
    `SELECT email_verification_expires_at
     FROM users
     WHERE id = $1`,
    [user.id],
    0
  );

  const expiresAt = expiryCheck.rows[0]?.email_verification_expires_at;
  if (!expiresAt || new Date(expiresAt) < new Date()) {
    return {
      statusCode: 302,
      headers: {
        Location: buildPublicAppPath('/email-verification-expired?reason=expired'),
      },
      body: '',
    };
  }

  await markEmailVerified(user.id);

  return {
    statusCode: 302,
    headers: { Location: buildPublicAppPath('/email-verified') },
    body: '',
  };
}

async function handleResendVerification(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const rateLimited = await enforceAuthVerificationIpRateLimit(event);
  if (rateLimited) {
    return rateLimited;
  }

  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const user = await fetchUserById(userId);
  if (!user) {
    return createErrorResponse(404, 'User not found');
  }

  if (!user.is_active) {
    return createErrorResponse(403, 'User account is disabled');
  }

  if (user.is_email_verified) {
    return createErrorResponse(400, 'Email is already verified', CORS_HEADERS, {
      code: 'EMAIL_ALREADY_VERIFIED',
    });
  }

  const cooldown = await assertVerificationEmailAllowed(userId);
  if (!cooldown.allowed) {
    return createErrorResponse(
      429,
      'Please wait before requesting another verification email',
      CORS_HEADERS,
      {
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds: cooldown.retryAfterSeconds,
      }
    );
  }

  const token = await assignVerificationToken(userId);
  const emailResult = await sendUserVerificationEmail(
    user.email,
    token,
    user.name,
    user.preferred_language
  );

  if (!emailResult.success) {
    return createErrorResponse(
      502,
      emailResult.error || 'Failed to send verification email',
      CORS_HEADERS,
      {
        code: 'EMAIL_SEND_FAILED',
      }
    );
  }

  return createSuccessResponse({ sent: true });
}

async function handleChangeVerificationEmail(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const rateLimited = await enforceAuthVerificationIpRateLimit(event);
  if (rateLimited) {
    return rateLimited;
  }

  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const data = parseJsonBody<ChangeVerificationEmailRequest>(event.body, {
    email: '',
  } as ChangeVerificationEmailRequest);

  const newEmail = data.email?.toLowerCase().trim();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return createErrorResponse(400, 'Valid email is required');
  }

  const user = await fetchUserById(userId);
  if (!user) {
    return createErrorResponse(404, 'User not found');
  }

  if (user.is_email_verified) {
    return createErrorResponse(400, 'Email is already verified', CORS_HEADERS, {
      code: 'EMAIL_ALREADY_VERIFIED',
    });
  }

  if (newEmail !== user.email) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND id != $2`,
      [newEmail, userId],
      0
    );
    if (existing.rows.length > 0) {
      return createErrorResponse(409, 'User with this email already exists');
    }

    await query(
      `UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newEmail, userId],
      0
    );
    user.email = newEmail;
  }

  const cooldown = await assertVerificationEmailAllowed(userId);
  if (!cooldown.allowed) {
    return createErrorResponse(
      429,
      'Please wait before requesting another verification email',
      CORS_HEADERS,
      {
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds: cooldown.retryAfterSeconds,
      }
    );
  }

  const token = await assignVerificationToken(userId);
  const emailResult = await sendUserVerificationEmail(
    user.email,
    token,
    user.name,
    user.preferred_language
  );

  if (!emailResult.success) {
    return createErrorResponse(
      502,
      emailResult.error || 'Failed to send verification email',
      CORS_HEADERS,
      {
        code: 'EMAIL_SEND_FAILED',
      }
    );
  }

  const updated = await fetchUserById(userId);
  if (!updated) {
    return createErrorResponse(404, 'User not found');
  }

  return createSuccessResponse(buildAuthPayload(updated));
}

async function handlePreferredLanguage(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const data = parseJsonBody<PreferredLanguageRequest>(event.body, {} as PreferredLanguageRequest);
  const preferredLanguage = normalizeEmailLocale(data.preferredLanguage);

  await updateUserPreferredLanguage(userId, preferredLanguage);

  const user = await fetchUserById(userId);
  if (!user) {
    return createErrorResponse(404, 'User not found');
  }

  return createSuccessResponse({ user: mapAuthUser(user) });
}

async function handleMe(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const user = await fetchUserById(userId);
  if (!user) {
    return createErrorResponse(404, 'User not found');
  }

  return createSuccessResponse({ user: mapAuthUser(user) });
}

async function handleUpgradeToArtist(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const current = await fetchUserById(userId);
  if (!current) {
    return createErrorResponse(404, 'User not found');
  }

  if (normalizeAccountType(current.account_type) !== 'listener') {
    return createErrorResponse(400, 'Account is already an artist account', CORS_HEADERS, {
      code: 'ALREADY_ARTIST',
    });
  }

  const data = parseJsonBody<UpgradeToArtistRequest>(event.body, {} as UpgradeToArtistRequest);
  const artistName = (data.artistName || data.siteName || data.name || '').trim();
  if (!artistName) {
    return createErrorResponse(400, 'Artist / band name is required');
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const publicSlug = await generateUniquePublicSlug(artistName, artistName, current.email);
      const username = await generateUniqueUsername(artistName, artistName, current.email);

      const result = await query<VerificationUserRow>(
        `UPDATE users
         SET account_type = 'artist',
             site_name = $2,
             username = $3,
             public_slug = $4,
             updated_at = NOW()
         WHERE id = $1 AND account_type = 'listener'
         RETURNING id, email, name, role, account_type, is_email_verified, preferred_language`,
        [userId, artistName, username, publicSlug],
        0
      );

      if (result.rows.length === 0) {
        return createErrorResponse(409, 'Account upgrade is not available', CORS_HEADERS, {
          code: 'UPGRADE_NOT_AVAILABLE',
        });
      }

      const updated = await fetchUserById(userId);
      if (!updated) {
        return createErrorResponse(404, 'User not found');
      }

      return createSuccessResponse(buildAuthPayload(updated));
    } catch (error: unknown) {
      const pgError = error as { code?: string };
      if (pgError?.code === '23505' && attempt < 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Failed to upgrade account after retry');
}

function neutralForgotPasswordResponse() {
  return createSuccessResponse({ message: FORGOT_PASSWORD_NEUTRAL_MESSAGE });
}

/**
 * POST /api/auth/forgot-password
 *
 * Issues a reset email for an existing, active account. To prevent email
 * enumeration the response body and status are identical whether or not the
 * account exists; the only externally observable difference is the IP rate
 * limit (a generic 429) which applies to all callers equally.
 *
 * Failures to send the email are NOT surfaced to the client — they're logged
 * and the same neutral success body is returned. Otherwise a third-party
 * SMTP/Resend outage would also let attackers enumerate accounts.
 */
async function handleForgotPassword(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const rateLimited = await enforceIpRateLimit(event, {
    bucketKey: 'password_reset_request',
    limit: PASSWORD_RESET_REQUEST_IP_LIMIT,
  });
  if (rateLimited) {
    return rateLimited;
  }

  const data = parseJsonBody<ForgotPasswordRequest>(event.body, {} as ForgotPasswordRequest);
  const rawEmail = (data.email ?? '').toString();
  const email = rawEmail.toLowerCase().trim();

  // Treat missing / malformed input the same as a not-found email: same
  // neutral response, no fast-fail that leaks anything.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return neutralForgotPasswordResponse();
  }

  const user = await findUserByEmailForReset(email);

  if (!user || !user.is_active) {
    return neutralForgotPasswordResponse();
  }

  const cooldown = await assertPasswordResetAllowed(user.id);
  if (!cooldown.allowed) {
    // Hide the per-user cooldown behind the neutral message so attackers
    // can't detect "user exists & is being probed" from a 429.
    return neutralForgotPasswordResponse();
  }

  const token = await assignPasswordResetToken(user.id);
  const emailResult = await sendUserPasswordResetEmail(
    user.email,
    token,
    user.name,
    user.preferred_language
  );

  if (!emailResult.success) {
    console.error('⚠️ Password reset email failed to send:', emailResult.error);
  }

  return neutralForgotPasswordResponse();
}

/**
 * POST /api/auth/reset-password
 *
 * Consumes a single-use reset token and sets a new password. Returns a single
 * generic error code (`INVALID_OR_EXPIRED_TOKEN`) for every failure mode that
 * concerns the token so a caller can't distinguish "expired" from "unknown"
 * from "already used" — only the password-policy violations get their own
 * dedicated code so the form can render a precise inline error.
 */
async function handleResetPassword(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const rateLimited = await enforceIpRateLimit(event, {
    bucketKey: 'password_reset_consume',
    limit: PASSWORD_RESET_CONSUME_IP_LIMIT,
  });
  if (rateLimited) {
    return rateLimited;
  }

  const data = parseJsonBody<ResetPasswordRequest>(event.body, {} as ResetPasswordRequest);
  const token = typeof data.token === 'string' ? data.token.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!token) {
    return createErrorResponse(400, 'Reset token is required', CORS_HEADERS, {
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return createErrorResponse(400, passwordError.message, CORS_HEADERS, {
      code: passwordError.code,
    });
  }

  const owner = await findActiveResetTokenOwner(token);
  if (!owner) {
    return createErrorResponse(400, 'Reset link is invalid or has expired', CORS_HEADERS, {
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  }

  await applyPasswordResetForUser(owner.id, password);

  return createSuccessResponse({ message: 'Password has been updated' });
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  try {
    const path = event.path.replace('/.netlify/functions/auth', '') || '/';

    if (
      (path === '/verify-email' || path.endsWith('/verify-email')) &&
      event.httpMethod === 'GET'
    ) {
      return handleVerifyEmailGet(event);
    }

    if ((path === '/me' || path.endsWith('/me')) && event.httpMethod === 'GET') {
      return handleMe(event);
    }

    if (event.httpMethod !== 'POST') {
      return createErrorResponse(405, 'Method not allowed');
    }

    if (path === '/resend-verification' || path.endsWith('/resend-verification')) {
      return handleResendVerification(event);
    }

    if (path === '/change-verification-email' || path.endsWith('/change-verification-email')) {
      return handleChangeVerificationEmail(event);
    }

    if (path === '/preferred-language' || path.endsWith('/preferred-language')) {
      return handlePreferredLanguage(event);
    }

    if (path === '/upgrade-to-artist' || path.endsWith('/upgrade-to-artist')) {
      return handleUpgradeToArtist(event);
    }

    if (path === '/forgot-password' || path.endsWith('/forgot-password')) {
      return handleForgotPassword(event);
    }

    if (path === '/reset-password' || path.endsWith('/reset-password')) {
      return handleResetPassword(event);
    }

    if (path === '/delete-account' || path.endsWith('/delete-account')) {
      const userId = requireAuth(event);
      if (!userId) {
        return unauthorizedFromAuthHeader(event);
      }

      try {
        const body = parseJsonBody<DeleteAccountRequest>(event.body, {
          currentPassword: '',
        } as DeleteAccountRequest);
        const result = await deleteUserAccount(userId, body.currentPassword?.trim() ?? '');
        return createSuccessResponse(result);
      } catch (error) {
        if (error instanceof DeleteAccountError) {
          return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
            code: error.code,
          });
        }
        const mapped = mapDeleteAccountError(error);
        return createErrorResponse(mapped.statusCode, mapped.message, CORS_HEADERS, {
          code: mapped.code,
        });
      }
    }

    // Регистрация
    if (path === '/register' || path.endsWith('/register')) {
      const rateLimited = await enforceAuthVerificationIpRateLimit(event);
      if (rateLimited) {
        return rateLimited;
      }

      const data = parseJsonBody<RegisterRequest>(event.body, {} as RegisterRequest);

      if (!data.email || !data.password) {
        return createErrorResponse(400, 'Email and password are required');
      }

      const registerPasswordError = validatePassword(data.password);
      if (registerPasswordError) {
        return createErrorResponse(400, registerPasswordError.message, CORS_HEADERS, {
          code: registerPasswordError.code,
        });
      }

      const accountType = normalizeAccountType(data.accountType);
      const isArtist = accountType === 'artist';
      const displayName = (data.siteName || data.name || '').trim();

      if (isArtist) {
        if (!displayName) {
          return createErrorResponse(400, 'Artist / band name is required for artist accounts');
        }
      } else if (!displayName) {
        return createErrorResponse(400, 'Name is required');
      }

      const existingUser = await query<UserRow>(
        `SELECT id FROM users WHERE email = $1`,
        [data.email.toLowerCase().trim()],
        0
      );

      if (existingUser.rows.length > 0) {
        return createErrorResponse(409, 'User with this email already exists');
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const normalizedEmail = data.email.toLowerCase().trim();
      const siteName = isArtist ? displayName : null;
      const preferredLanguage = normalizeEmailLocale(data.preferredLanguage);

      let result: Awaited<ReturnType<typeof query<UserRow>>> | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const publicSlug = isArtist
            ? await generateUniquePublicSlug(siteName, displayName, normalizedEmail)
            : null;
          const username = isArtist
            ? await generateUniqueUsername(siteName, displayName, normalizedEmail)
            : null;

          result = await query<UserRow>(
            `INSERT INTO users (
               email, name, username, site_name, public_slug, password_hash,
               is_active, is_email_verified, genre_code, preferred_language, account_type
             )
             VALUES ($1, $2, $3, $4, $5, $6, true, false, $7, $8, $9)
             RETURNING id, email, name, role, account_type, is_email_verified, preferred_language`,
            [
              normalizedEmail,
              displayName,
              username,
              siteName,
              publicSlug,
              passwordHash,
              'other',
              preferredLanguage,
              accountType,
            ],
            0
          );
          break;
        } catch (error: any) {
          const isUniqueViolation = error?.code === '23505';
          if (isUniqueViolation && attempt < 1) {
            lastError = error;
            continue;
          }
          throw error;
        }
      }

      if (!result) {
        throw lastError || new Error('Failed to create user after retry');
      }

      const user = result.rows[0];
      const cooldown = await assertVerificationEmailAllowed(user.id);
      if (!cooldown.allowed) {
        return createErrorResponse(
          429,
          'Please wait before requesting another verification email',
          CORS_HEADERS,
          {
            code: 'RESEND_COOLDOWN',
            retryAfterSeconds: cooldown.retryAfterSeconds,
          }
        );
      }

      const verificationToken = await assignVerificationToken(user.id);
      const emailResult = await sendUserVerificationEmail(
        user.email,
        verificationToken,
        user.name,
        user.preferred_language
      );

      if (!emailResult.success) {
        console.error('⚠️ Verification email failed after register:', emailResult.error);
      }

      return createSuccessResponse(buildAuthPayload(user), 201);
    }

    // Вход
    if (path === '/login' || path.endsWith('/login')) {
      const data = parseJsonBody<LoginRequest>(event.body, {} as LoginRequest);

      if (!data.email || !data.password) {
        return createErrorResponse(400, 'Email and password are required');
      }

      const normalizedEmail = data.email.toLowerCase().trim();

      // Brute-force / credential-stuffing protection. Runs BEFORE any password
      // comparison so we don't leak account existence via timing and don't give
      // attackers free bcrypt work to mount.
      const preCheck = await checkLoginRateLimit(event, normalizedEmail);
      if (!preCheck.allowed) {
        return loginRateLimitResponse(preCheck.retryAfterSeconds);
      }

      const result = await query<UserRow>(
        `SELECT id, email, name, password_hash, is_active, role, account_type, is_email_verified, preferred_language
         FROM users
         WHERE email = $1`,
        [normalizedEmail],
        0
      );

      if (result.rows.length === 0) {
        await recordLoginFailure(event, normalizedEmail);
        return createErrorResponse(401, 'Invalid email or password', CORS_HEADERS, {
          code: 'INVALID_CREDENTIALS',
        });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        // Admin-disabled account: not a brute-force signal. Preserve the
        // existing generic 403 without bumping rate-limit counters.
        return createErrorResponse(403, 'User account is disabled');
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);

      if (!isPasswordValid) {
        await recordLoginFailure(event, normalizedEmail);
        return createErrorResponse(401, 'Invalid email or password', CORS_HEADERS, {
          code: 'INVALID_CREDENTIALS',
        });
      }

      // Success clears the email bucket so a legitimate user who mistyped a few
      // times isn't stuck halfway to lockout. IP bucket is intentionally NOT
      // reset so attackers can't unlock IP-wide brute force via one valid login.
      await resetLoginRateLimitOnSuccess(normalizedEmail);

      if (data.preferredLanguage) {
        await updateUserPreferredLanguage(user.id, normalizeEmailLocale(data.preferredLanguage));
        const refreshed = await fetchUserById(user.id);
        if (refreshed) {
          return createSuccessResponse(buildAuthPayload(refreshed));
        }
      }

      return createSuccessResponse(buildAuthPayload(user));
    }

    return createErrorResponse(404, 'Endpoint not found');
  } catch (error) {
    return handleError(error, 'auth function');
  }
};
