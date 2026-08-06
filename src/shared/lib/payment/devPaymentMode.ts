/**
 * Client-side dev payment mode flag (UX only — server enforces DEV_PAYMENT_MODE).
 *
 * Uses process.env (inlined by webpack DefinePlugin) — not import.meta.env, which breaks Jest.
 */

const DEV_PAYMENT_BANNER = '🧪 DEV PAYMENT MODE';

function emitDevPaymentLog(lines: string[]): void {
  console.log([DEV_PAYMENT_BANNER, ...lines].join('\n'));
}

export function isDevPaymentModeClientEnabled(): boolean {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev && process.env.VITE_DEV_PAYMENT_MODE === 'true';
}

/** Browser console: client redirect after dev album checkout. */
export function logDevPaymentAlbumRedirect(params: {
  orderId: string;
  paymentId?: string;
  redirectUrl: string;
}): void {
  emitDevPaymentLog([
    'Type: album',
    `Order: ${params.orderId}`,
    ...(params.paymentId ? [`Payment: ${params.paymentId}`] : []),
    'Skipping YooKassa',
    `Redirect → ${params.redirectUrl}`,
  ]);
}

/** Browser console: client redirect after dev subscription checkout. */
export function logDevPaymentSubscriptionRedirect(params: {
  subscriptionPaymentId: string;
  paymentId?: string;
  redirectUrl: string;
}): void {
  emitDevPaymentLog([
    'Type: subscription',
    `SubscriptionPayment: ${params.subscriptionPaymentId}`,
    ...(params.paymentId ? [`Payment: ${params.paymentId}`] : []),
    'Skipping YooKassa',
    `Redirect → ${params.redirectUrl}`,
  ]);
}
