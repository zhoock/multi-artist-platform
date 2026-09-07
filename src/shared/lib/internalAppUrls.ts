/**
 * Absolute URLs for internal app routes (`/auth`, `/pay/*`, …).
 * Internal paths never receive a locale prefix; origin comes from `buildPublicSiteUrl`.
 *
 * Callers must pass an already sanitized `returnTo` (see `sanitizeReturnPath`).
 */
import {
  ALBUM_PAY_STATUS_PATH,
  ALBUM_PAY_SUCCESS_PATH,
  SUBSCRIPTION_PAY_SUCCESS_PATH,
} from './paymentRoutes';
import {
  appendCheckoutStatusTokenParams,
  type CheckoutStatusTokenParams,
} from './payment/checkoutStatusTokenParams';
import { buildPublicSiteUrl } from './publicSiteOrigin';

/** Same-site absolute URL for an internal relative path (e.g. `/pay/status?…`). */
export function buildInternalAppSiteUrl(relativePath: string): string {
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return buildPublicSiteUrl(path);
}

/** YooKassa / dev return URL after album checkout — `/pay/status?returnTo=…`. */
export function buildAlbumPaymentStatusReturnUrl(returnTo: string): string {
  const params = new URLSearchParams();
  params.set('returnTo', returnTo);
  return buildInternalAppSiteUrl(`${ALBUM_PAY_STATUS_PATH}?${params.toString()}`);
}

/** Dev-only album payment resolver URL with order id. */
export function buildAlbumPaymentDevStatusUrl(input: {
  orderId: string;
  returnTo: string;
  statusToken?: string;
  statusTokenExpiresAt?: number;
}): string {
  const params = new URLSearchParams();
  params.set('orderId', input.orderId.trim());
  params.set('returnTo', input.returnTo);
  if (input.statusToken && input.statusTokenExpiresAt != null) {
    appendCheckoutStatusTokenParams(params, {
      statusToken: input.statusToken,
      statusTokenExpiresAt: input.statusTokenExpiresAt,
    });
  }
  return buildInternalAppSiteUrl(`${ALBUM_PAY_STATUS_PATH}?${params.toString()}`);
}

/** Direct success URL when payment completes without YooKassa redirect. */
export function buildAlbumPaymentSuccessUrl(
  orderId: string,
  checkoutStatusToken?: CheckoutStatusTokenParams
): string {
  const params = new URLSearchParams();
  params.set('orderId', orderId.trim());
  if (checkoutStatusToken) {
    appendCheckoutStatusTokenParams(params, checkoutStatusToken);
  }
  return buildInternalAppSiteUrl(`${ALBUM_PAY_SUCCESS_PATH}?${params.toString()}`);
}

/** YooKassa return URL after subscription checkout. */
export function buildSubscriptionPaymentStatusReturnUrl(returnTo: string): string {
  const params = new URLSearchParams();
  params.set('returnTo', returnTo);
  return buildInternalAppSiteUrl(`${SUBSCRIPTION_PAY_SUCCESS_PATH}?${params.toString()}`);
}

/** Dev-only subscription payment resolver URL. */
export function buildSubscriptionPaymentDevStatusUrl(input: {
  subscriptionPaymentId: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams();
  params.set('subscriptionPaymentId', input.subscriptionPaymentId.trim());
  params.set('returnTo', input.returnTo);
  return buildInternalAppSiteUrl(`${SUBSCRIPTION_PAY_SUCCESS_PATH}?${params.toString()}`);
}

/** Internal auth overlay path — never locale-prefixed. */
export function buildAuthPath(searchParams: URLSearchParams): string {
  const q = searchParams.toString();
  return q ? `/auth?${q}` : '/auth';
}
