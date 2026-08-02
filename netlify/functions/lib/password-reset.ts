/**
 * Password reset token lifecycle.
 *
 * Threat model:
 *   - Tokens MUST NOT be stored in plaintext. The plaintext value lives only
 *     in the email; the DB keeps a SHA-256 hex digest. A leaked DB snapshot
 *     therefore can't be replayed against /api/auth/reset-password.
 *   - Tokens MUST be single-use. After a successful reset all three
 *     `password_reset_*` columns are cleared.
 *   - Tokens MUST expire (1 hour by default). The `password_reset_expires_at`
 *     column is checked at consume time.
 *   - The forgot-password endpoint MUST NOT reveal whether the email exists.
 *     Callers always return the same neutral message regardless of whether a
 *     row was found; timing differences are minimized by always performing a
 *     bcrypt-equivalent token hash even when no user matches.
 */

import crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { query } from './db';
import { sendPasswordResetEmail } from './email';
import { normalizeEmailLocale } from './email-locale';
import { buildPasswordResetUrl } from './public-app-url';

/** Raw token entropy. 32 bytes = 256 bits, URL-safe base64 → 43 chars. */
const TOKEN_BYTES = 32;
/** Time-to-live of a freshly issued token. */
export const PASSWORD_RESET_TTL_MINUTES = 60;
/** Per-user minimum interval between consecutive resend requests. */
export const PASSWORD_RESET_USER_COOLDOWN_SECONDS = 60;
export {
  MIN_PASSWORD_LENGTH as PASSWORD_RESET_MIN_PASSWORD_LENGTH,
  validatePassword as validateNewPassword,
  type PasswordPolicyError,
} from './password-policy';

export interface PasswordResetUserRow {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  preferred_language: string | null;
}

interface PasswordResetTokenRow {
  id: string;
  password_reset_expires_at: Date | string | null;
  is_active: boolean;
}

/**
 * Generate a fresh URL-safe token and its SHA-256 hex digest. Only the digest
 * goes into the database; the plaintext value is what gets emailed to the
 * user and what the reset-password endpoint hashes for lookup.
 */
export function generatePasswordResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashPasswordResetToken(token);
  return { token, tokenHash };
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function ttlExpiresAt(): Date {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + PASSWORD_RESET_TTL_MINUTES);
  return expires;
}

/**
 * Look up a user by lower-cased email. Returns null when no row exists. The
 * caller decides whether to keep that information from the response.
 */
export async function findUserByEmailForReset(email: string): Promise<PasswordResetUserRow | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;

  const result = await query<PasswordResetUserRow>(
    `SELECT id, email, name, is_active, preferred_language
     FROM users
     WHERE email = $1`,
    [normalized],
    0
  );
  return result.rows[0] ?? null;
}

/**
 * Decide whether a fresh reset request for the given user is allowed right
 * now, based on `password_reset_requested_at`. Same shape as the verification
 * email cooldown so the response surface stays uniform.
 */
export async function assertPasswordResetAllowed(
  userId: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const result = await query<{ id: string }>(
    `UPDATE users
     SET password_reset_requested_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND (
         password_reset_requested_at IS NULL
         OR password_reset_requested_at < NOW() - make_interval(secs => $2::int)
       )
     RETURNING id`,
    [userId, PASSWORD_RESET_USER_COOLDOWN_SECONDS],
    0
  );

  if (result.rows.length > 0) {
    return { allowed: true };
  }

  const lastRequested = await query<{ password_reset_requested_at: Date | null }>(
    `SELECT password_reset_requested_at FROM users WHERE id = $1`,
    [userId],
    0
  );
  const requestedAt = lastRequested.rows[0]?.password_reset_requested_at;
  const retryAfterSeconds = requestedAt
    ? Math.max(
        1,
        Math.ceil(
          PASSWORD_RESET_USER_COOLDOWN_SECONDS -
            (Date.now() - new Date(requestedAt).getTime()) / 1000
        )
      )
    : PASSWORD_RESET_USER_COOLDOWN_SECONDS;
  return { allowed: false, retryAfterSeconds };
}

/**
 * Issue a fresh reset token for the user, replacing any previous one. Returns
 * the plaintext token to email; the database only retains its hash.
 */
export async function assignPasswordResetToken(userId: string): Promise<string> {
  const { token, tokenHash } = generatePasswordResetToken();
  const expiresAt = ttlExpiresAt();

  await query(
    `UPDATE users
     SET password_reset_token_hash = $1,
         password_reset_expires_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [tokenHash, expiresAt.toISOString(), userId],
    0
  );

  return token;
}

/**
 * Best-effort delivery. The forgot-password handler still returns the same
 * neutral response even on failure to keep email enumeration impossible. We
 * surface the error string for server-side logging only.
 */
export async function sendUserPasswordResetEmail(
  email: string,
  token: string,
  userName?: string | null,
  preferredLanguage?: string | null
): Promise<{ success: boolean; error?: string }> {
  const resetUrl = buildPasswordResetUrl(token);
  const locale = normalizeEmailLocale(preferredLanguage);

  return sendPasswordResetEmail({
    to: email,
    resetUrl,
    userName: userName ?? undefined,
    locale,
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
}

/**
 * Atomically resolve a plaintext reset token to its user, validate that the
 * row is active and within the TTL window. Returns null for any failure mode
 * so the caller can surface a single generic error and avoid leaking which
 * specific condition failed.
 */
export async function findActiveResetTokenOwner(
  token: string
): Promise<PasswordResetTokenRow | null> {
  if (!token) return null;
  const tokenHash = hashPasswordResetToken(token);

  const result = await query<PasswordResetTokenRow>(
    `SELECT id, password_reset_expires_at, is_active
     FROM users
     WHERE password_reset_token_hash = $1`,
    [tokenHash],
    0
  );

  const row = result.rows[0];
  if (!row) return null;
  if (!row.is_active) return null;
  if (!row.password_reset_expires_at) return null;
  if (new Date(row.password_reset_expires_at) < new Date()) return null;
  return row;
}

/**
 * Consume the token: rotate the password hash and clear all reset columns so
 * the same link can never be used again.
 */
export async function applyPasswordResetForUser(
  userId: string,
  newPassword: string
): Promise<void> {
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await query(
    `UPDATE users
     SET password_hash = $1,
         password_reset_token_hash = NULL,
         password_reset_expires_at = NULL,
         password_reset_requested_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND is_active = true`,
    [newPasswordHash, userId],
    0
  );
}
