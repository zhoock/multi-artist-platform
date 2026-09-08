/**
 * Email verification helpers (token generation, DB updates)
 */

import crypto from 'node:crypto';
import { createErrorResponse } from './api-helpers';
import { query } from './db';
import { sendVerificationEmail } from './email';
import { normalizeEmailLocale, type EmailLocale } from './email-locale';
import { normalizeAccountType } from './account-type';
import { buildEmailVerificationUrl } from './public-app-url';

const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 24;
export const VERIFICATION_EMAIL_COOLDOWN_SECONDS = 60;

export type VerificationEmailAllowResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface VerificationUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  account_type?: string | null;
  is_email_verified: boolean;
  preferred_language?: string | null;
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function verificationExpiresAt(): Date {
  const expires = new Date();
  expires.setHours(expires.getHours() + TOKEN_TTL_HOURS);
  return expires;
}

export async function assertVerificationEmailAllowed(
  userId: string
): Promise<VerificationEmailAllowResult> {
  const result = await query<{ id: string }>(
    `UPDATE users
     SET verification_email_sent_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND (
         verification_email_sent_at IS NULL
         OR verification_email_sent_at < NOW() - INTERVAL '60 seconds'
       )
     RETURNING id`,
    [userId],
    0
  );

  if (result.rows.length > 0) {
    return { allowed: true };
  }

  const sentAtResult = await query<{ verification_email_sent_at: Date | null }>(
    `SELECT verification_email_sent_at FROM users WHERE id = $1`,
    [userId],
    0
  );
  const sentAt = sentAtResult.rows[0]?.verification_email_sent_at;
  const retryAfterSeconds = sentAt
    ? Math.max(
        1,
        Math.ceil(VERIFICATION_EMAIL_COOLDOWN_SECONDS - (Date.now() - sentAt.getTime()) / 1000)
      )
    : VERIFICATION_EMAIL_COOLDOWN_SECONDS;

  return { allowed: false, retryAfterSeconds };
}

export async function assignVerificationToken(userId: string): Promise<string> {
  const token = generateVerificationToken();
  const expiresAt = verificationExpiresAt();

  await query(
    `UPDATE users
     SET email_verification_token = $1,
         email_verification_expires_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [token, expiresAt.toISOString(), userId],
    0
  );

  return token;
}

export async function clearVerificationToken(userId: string): Promise<void> {
  await query(
    `UPDATE users
     SET email_verification_token = NULL,
         email_verification_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId],
    0
  );
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(
    `UPDATE users
     SET is_email_verified = true,
         email_verification_token = NULL,
         email_verification_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId],
    0
  );
}

export async function sendUserVerificationEmail(
  email: string,
  token: string,
  userName?: string | null,
  preferredLanguage?: string | null
): Promise<{ success: boolean; error?: string }> {
  const verifyUrl = buildEmailVerificationUrl(token);
  const locale = normalizeEmailLocale(preferredLanguage);

  return sendVerificationEmail({
    to: email,
    verifyUrl,
    userName: userName ?? undefined,
    locale,
  });
}

export async function isUserEmailVerified(userId: string): Promise<boolean> {
  const result = await query<{ is_email_verified: boolean }>(
    `SELECT is_email_verified FROM users WHERE id = $1`,
    [userId],
    0
  );
  return Boolean(result.rows[0]?.is_email_verified);
}

export function createEmailNotVerifiedResponse() {
  return createErrorResponse(403, 'Email verification required', undefined, {
    code: 'EMAIL_NOT_VERIFIED',
  });
}

/** Returns an error response when the user must verify email before upload mutations. */
export async function guardUserEmailVerifiedForUpload(
  userId: string
): Promise<ReturnType<typeof createErrorResponse> | null> {
  if (await isUserEmailVerified(userId)) {
    return null;
  }
  return createEmailNotVerifiedResponse();
}

export function mapAuthUser(user: VerificationUserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === 'admin' ? ('admin' as const) : ('user' as const),
    accountType: normalizeAccountType(user.account_type),
    isEmailVerified: Boolean(user.is_email_verified),
    preferredLanguage: normalizeEmailLocale(user.preferred_language),
  };
}
