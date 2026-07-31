/**
 * Утилиты для отправки email через Resend
 */

import { Resend } from 'resend';
import { buildAccountDeletedEmailContent } from './account-deleted-email-template';
import { buildPasswordResetEmailContent } from './password-reset-email-template';
import { buildPurchaseEmailContent } from './purchase-email-template';
import { buildVerificationEmailContent } from './verification-email-template';
import type { EmailLocale } from './email-locale';
import { getEmailFrom, getSiteDisplayName } from './email-utils';
import { buildAlbumCoverEmailUrl } from './storage-public-url';
import { buildPublicAlbumEmailUrl, getPublicAppOrigin } from './public-app-url';
import { reservePurchaseEmail, releasePurchaseEmailReservation } from './email-dedupe';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Temporary platform placeholder until the official brand name is chosen. */
const PURCHASE_BRAND_DISPLAY_NAME = 'Название сайта';

interface SendPurchaseEmailOptions {
  to: string;
  customerName?: string;
  albumName: string;
  artistName: string;
  orderId: string;
  /** Canonical album slug used to build the public album URL (e.g. `rubber-soul`). */
  albumSlug: string;
  /** Artist public slug for `?artist=` context in the album link. */
  artistPublicSlug?: string | null;
  /** Stored album cover value (storage path or absolute URL). */
  albumCover?: string | null;
  /** UUID of the album owner — needed when `albumCover` is a bare filename. */
  albumUserId?: string | null;
  /** Two-letter album language; controls the locale prefix of the public album URL. */
  albumLang?: string | null;
  /**
   * Optional explicit public origin override. When omitted, the origin is derived from
   * `PUBLIC_APP_URL` / `NETLIFY_SITE_URL` / `URL` / `DEPLOY_PRIME_URL` (see `public-app-url.ts`),
   * so localhost, Netlify previews, and production all "just work" without code edits.
   */
  siteUrl?: string;
  /**
   * Provider payment id (e.g. YooKassa `payment.id`). When provided, the email send becomes
   * idempotent: concurrent webhook + polling fires will reserve the same row and only the
   * first caller actually sends mail; subsequent calls return `{ success: true, alreadySent: true }`.
   */
  paymentId?: string;
  /** Locale of the *email body copy*. Distinct from `albumLang` (album page locale). */
  locale?: EmailLocale;
}

function resolvePurchaseBrandName(): string {
  const envName = (process.env.SITE_DISPLAY_NAME || '').trim();
  if (envName && envName.toLowerCase() !== 'mixer') {
    return envName;
  }
  const fallback = getSiteDisplayName();
  return fallback && fallback.toLowerCase() !== 'mixer' ? fallback : PURCHASE_BRAND_DISPLAY_NAME;
}

export interface PurchaseEmailResult {
  success: boolean;
  /** `true` when a previous successful send was found and this call was a no-op. */
  alreadySent?: boolean;
  error?: string;
}

export async function sendPurchaseEmail(
  options: SendPurchaseEmailOptions
): Promise<PurchaseEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY is not set');
    return { success: false, error: 'Email service not configured: RESEND_API_KEY is missing' };
  }

  // Atomic idempotency reservation. If another call already reserved this orderId+paymentId,
  // bail out without re-sending. Caller can detect this via `alreadySent` on the result.
  let reservedForIdempotency = false;
  if (options.paymentId) {
    try {
      reservedForIdempotency = await reservePurchaseEmail(options.orderId, options.paymentId);
    } catch (reserveErr) {
      console.error('purchase_email.dedupe_reserve_failed', {
        orderIdSuffix: `…${options.orderId.slice(-6)}`,
        err: reserveErr instanceof Error ? reserveErr.message : String(reserveErr),
      });
      // Defensive: if dedupe layer is unavailable, prefer to skip rather than risk a duplicate.
      return {
        success: false,
        error:
          reserveErr instanceof Error ? reserveErr.message : 'purchase_email_dedupe_unavailable',
      };
    }
    if (!reservedForIdempotency) {
      console.log('purchase_email.duplicate_skipped', {
        orderIdSuffix: `…${options.orderId.slice(-6)}`,
        paymentIdSuffix: `…${options.paymentId.slice(-6)}`,
      });
      return { success: true, alreadySent: true };
    }
  }

  try {
    const siteUrl = (options.siteUrl?.trim() || getPublicAppOrigin()).replace(/\/+$/, '');
    const locale = options.locale ?? 'en';
    const albumLang = (options.albumLang || locale || 'en').toLowerCase();

    const albumCoverUrl = buildAlbumCoverEmailUrl(options.albumCover, options.albumUserId);
    const albumUrl = buildPublicAlbumEmailUrl({
      origin: siteUrl,
      albumLang,
      albumSlug: options.albumSlug,
      artistPublicSlug: options.artistPublicSlug,
    });

    const { html, text, subject } = buildPurchaseEmailContent({
      locale,
      customerName: options.customerName,
      albumName: options.albumName,
      artistName: options.artistName,
      orderId: options.orderId,
      albumUrl,
      albumCoverUrl,
      siteName: resolvePurchaseBrandName(),
    });

    const result = await resend.emails.send({
      from: getEmailFrom(),
      to: options.to,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error('❌ Error sending email:', result.error);
      if (reservedForIdempotency) {
        await releasePurchaseEmailReservation(options.orderId).catch(() => undefined);
      }
      return { success: false, error: result.error.message || 'Failed to send email' };
    }

    console.log('✅ Purchase email sent successfully:', {
      to: options.to,
      orderId: options.orderId,
      locale,
      emailId: result.data?.id,
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error in sendPurchaseEmail:', error);
    if (reservedForIdempotency) {
      await releasePurchaseEmailReservation(options.orderId).catch(() => undefined);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface SendVerificationEmailOptions {
  to: string;
  verifyUrl: string;
  userName?: string;
  locale?: EmailLocale;
}

export async function sendVerificationEmail(
  options: SendVerificationEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is not set');
      return { success: false, error: 'Email service not configured: RESEND_API_KEY is missing' };
    }

    const locale = options.locale ?? 'en';
    const { html, text, subject } = buildVerificationEmailContent({
      locale,
      verifyUrl: options.verifyUrl,
      userName: options.userName,
      siteName: getSiteDisplayName(),
    });

    const result = await resend.emails.send({
      from: getEmailFrom(),
      to: options.to,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error('❌ Error sending verification email:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error in sendVerificationEmail:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface SendPasswordResetEmailOptions {
  to: string;
  resetUrl: string;
  userName?: string | null;
  expiresInMinutes: number;
  locale?: EmailLocale;
}

export async function sendPasswordResetEmail(
  options: SendPasswordResetEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is not set');
      return { success: false, error: 'Email service not configured: RESEND_API_KEY is missing' };
    }

    const locale = options.locale ?? 'en';
    const { html, text, subject } = buildPasswordResetEmailContent({
      locale,
      resetUrl: options.resetUrl,
      userName: options.userName ?? undefined,
      siteName: getSiteDisplayName(),
      expiresInMinutes: options.expiresInMinutes,
    });

    const result = await resend.emails.send({
      from: getEmailFrom(),
      to: options.to,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error('❌ Error sending password reset email:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error in sendPasswordResetEmail:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface SendAccountDeletedEmailOptions {
  to: string;
  locale?: EmailLocale;
}

export async function sendAccountDeletedEmail(
  options: SendAccountDeletedEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is not set');
      return { success: false, error: 'Email service not configured: RESEND_API_KEY is missing' };
    }

    const locale = options.locale ?? 'en';
    const { html, text, subject } = buildAccountDeletedEmailContent(locale);

    const result = await resend.emails.send({
      from: getEmailFrom(),
      to: options.to,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error('❌ Error sending account deleted email:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }

    console.log('✅ Account deleted email sent successfully:', {
      to: options.to,
      locale,
      emailId: result.data?.id,
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error in sendAccountDeletedEmail:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
