/**
 * Billing settlement/grace use the shared renewal countdown clock, which can lag wall time
 * by up to one tick (up to 1s near period end). For entitlement UI, never evaluate “before
 * charge anchor” on a clock that is behind the browser.
 */
export function resolveBillingEvaluationNow(sharedClock: Date): Date {
  if (typeof window === 'undefined') {
    return sharedClock;
  }
  const wallMs = Date.now();
  const sharedMs = sharedClock.getTime();
  if (wallMs <= sharedMs) {
    return sharedClock;
  }
  return new Date(wallMs);
}
