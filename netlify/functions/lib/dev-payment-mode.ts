/**
 * Development-only album checkout: skip YooKassa, run real post-payment logic.
 *
 * Enabled only when DEV_PAYMENT_MODE=true AND the runtime is not a production deploy.
 * Never rely on client flags — server functions call isDevPaymentModeEnabled() only.
 */

const DEV_PAYMENT_RAW_MARKER = 'devPaymentMode' as const;

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
