/**
 * Development-only checkout (albums + subscriptions): skip YooKassa, run real post-payment logic.
 *
 * Enabled only when DEV_PAYMENT_MODE=true AND the runtime is not a production deploy.
 * Never rely on client flags — server functions call isDevPaymentModeEnabled() only.
 */

const DEV_PAYMENT_RAW_MARKER = 'devPaymentMode' as const;
const DEV_PAYMENT_BANNER = '🧪 DEV PAYMENT MODE';

export function isDevPaymentModeEnabled(): boolean {
  if (process.env.DEV_PAYMENT_MODE !== 'true') {
    return false;
  }

  // Netlify production deploy context — hard off
  if (process.env.CONTEXT === 'production') {
    return false;
  }

  // Production Node without local Netlify Dev
  if (process.env.NODE_ENV === 'production' && process.env.NETLIFY_DEV !== 'true') {
    return false;
  }

  return true;
}

export function devPaymentRawMarker(): Record<string, boolean> {
  return { [DEV_PAYMENT_RAW_MARKER]: true };
}

export function isDevMarkedPayment(rawLastEvent: unknown): boolean {
  if (!rawLastEvent || typeof rawLastEvent !== 'object') {
    return false;
  }
  return (rawLastEvent as Record<string, unknown>)[DEV_PAYMENT_RAW_MARKER] === true;
}

function emitDevPaymentLog(lines: string[]): void {
  console.log([DEV_PAYMENT_BANNER, ...lines].join('\n'));
}

/** create-payment: album checkout persisted without YooKassa. */
export function logDevPaymentAlbumCreate(params: {
  orderId: string;
  paymentId: string;
  returnTo?: string;
}): void {
  const redirect = buildAlbumStatusRedirectPath(params.orderId, params.returnTo);
  emitDevPaymentLog([
    'Type: album',
    `Order: ${params.orderId}`,
    `Payment: ${params.paymentId}`,
    'Skipping YooKassa',
    `Redirect → ${redirect}`,
  ]);
}

/** get-payment-status: album fulfillment from DB (no YooKassa poll). */
export function logDevPaymentAlbumStatus(params: { orderId: string; paymentId: string }): void {
  emitDevPaymentLog([
    'Type: album',
    `Order: ${params.orderId}`,
    `Payment: ${params.paymentId}`,
    'Skipping YooKassa',
    'Fulfillment → applyAlbumPaymentSuccess()',
  ]);
}

/** create-subscription-payment: subscription checkout persisted without YooKassa. */
export function logDevPaymentSubscriptionCreate(params: {
  subscriptionPaymentId: string;
  paymentId: string;
  returnTo?: string;
}): void {
  const redirect = buildSubscriptionSuccessRedirectPath(
    params.subscriptionPaymentId,
    params.returnTo
  );
  emitDevPaymentLog([
    'Type: subscription',
    `SubscriptionPayment: ${params.subscriptionPaymentId}`,
    `Payment: ${params.paymentId}`,
    'Skipping YooKassa',
    `Redirect → ${redirect}`,
  ]);
}

/** get-subscription-payment-status: subscription fulfillment from DB (no YooKassa poll). */
export function logDevPaymentSubscriptionStatus(params: {
  subscriptionPaymentId?: string;
  paymentId: string;
}): void {
  emitDevPaymentLog([
    'Type: subscription',
    ...(params.subscriptionPaymentId
      ? [`SubscriptionPayment: ${params.subscriptionPaymentId}`]
      : []),
    `Payment: ${params.paymentId}`,
    'Skipping YooKassa',
    'Fulfillment → fulfillSubscriptionPayment()',
  ]);
}

export function buildAlbumStatusRedirectPath(orderId: string, returnTo?: string): string {
  const qs = new URLSearchParams({ orderId });
  if (returnTo?.trim()) {
    qs.set('returnTo', returnTo.trim());
  }
  return `/pay/status?${qs.toString()}`;
}

export function buildSubscriptionSuccessRedirectPath(
  subscriptionPaymentId: string,
  returnTo?: string
): string {
  const qs = new URLSearchParams({ subscriptionPaymentId });
  if (returnTo?.trim()) {
    qs.set('returnTo', returnTo.trim());
  }
  return `/pay/subscription-success?${qs.toString()}`;
}

/** Extract returnTo from a full return URL sent by the client (best-effort). */
export function extractReturnToFromReturnUrl(
  returnUrl: string | null | undefined
): string | undefined {
  if (!returnUrl?.trim()) {
    return undefined;
  }
  try {
    const value = new URL(returnUrl.trim()).searchParams.get('returnTo')?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
