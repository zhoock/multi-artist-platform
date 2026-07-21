import { buildPublicAppPath } from './public-app-url';

/** Neutral landing after YooKassa; client redirects to success/fail once status is known. */
export const ALBUM_PAY_STATUS_PATH = '/pay/status';
export const ALBUM_PAY_SUCCESS_PATH = '/pay/success';
export const ALBUM_PAY_FAIL_PATH = '/pay/fail';
export const SUBSCRIPTION_PAY_SUCCESS_PATH = '/pay/subscription-success';

export interface ResolveYooKassaReturnUrlOptions {
  /** From request body (`returnUrl`). */
  requestedUrl?: string | null;
  /** `YOOKASSA_RETURN_URL` or `YOOKASSA_SUBSCRIPTION_RETURN_URL`. */
  envReturnUrl?: string | null;
  /** Parsed Referer origin when available. */
  refererOrigin?: string | null;
  /** e.g. `/pay/success`. */
  successPath: string;
  queryParams: Record<string, string>;
}

/**
 * Builds YooKassa `confirmation.return_url` without hardcoded production domains.
 * Priority: body returnUrl → env → Referer origin + path → getPublicAppOrigin() + path.
 */
export function resolveYooKassaReturnUrl(options: ResolveYooKassaReturnUrlOptions): string {
  const { requestedUrl, envReturnUrl, refererOrigin, successPath, queryParams } = options;

  const path = successPath.startsWith('/') ? successPath : `/${successPath}`;
  const platformFallback = buildPublicAppPath(path);

  const baseReturnUrl =
    requestedUrl?.trim() ||
    envReturnUrl?.trim() ||
    (refererOrigin ? `${refererOrigin.replace(/\/+$/, '')}${path}` : '') ||
    platformFallback;

  try {
    const urlObject = new URL(baseReturnUrl, refererOrigin || undefined);
    for (const [key, value] of Object.entries(queryParams)) {
      urlObject.searchParams.set(key, value);
    }
    return urlObject.toString();
  } catch {
    const fallbackUrl = new URL(platformFallback);
    for (const [key, value] of Object.entries(queryParams)) {
      fallbackUrl.searchParams.set(key, value);
    }
    return fallbackUrl.toString();
  }
}

export function resolveAlbumPaymentReturnUrl(options: {
  requestedUrl?: string | null;
  refererOrigin?: string | null;
  orderId: string;
}): string {
  return resolveYooKassaReturnUrl({
    requestedUrl: options.requestedUrl,
    envReturnUrl: process.env.YOOKASSA_RETURN_URL,
    refererOrigin: options.refererOrigin,
    successPath: ALBUM_PAY_STATUS_PATH,
    queryParams: { orderId: options.orderId },
  });
}

export function resolveSubscriptionPaymentReturnUrl(options: {
  requestedUrl?: string | null;
  refererOrigin?: string | null;
  subscriptionPaymentId: string;
}): string {
  const envReturnUrl =
    process.env.YOOKASSA_SUBSCRIPTION_RETURN_URL?.trim() ||
    process.env.YOOKASSA_RETURN_URL?.trim() ||
    undefined;

  return resolveYooKassaReturnUrl({
    requestedUrl: options.requestedUrl,
    envReturnUrl,
    refererOrigin: options.refererOrigin,
    successPath: SUBSCRIPTION_PAY_SUCCESS_PATH,
    queryParams: { subscriptionPaymentId: options.subscriptionPaymentId },
  });
}
