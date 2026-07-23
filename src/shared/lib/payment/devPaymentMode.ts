/**
 * Client-side dev payment mode flag (UX only — server enforces DEV_PAYMENT_MODE).
 */
export function isDevPaymentModeClientEnabled(): boolean {
  return Boolean(import.meta.env.DEV) && import.meta.env.VITE_DEV_PAYMENT_MODE === 'true';
}
