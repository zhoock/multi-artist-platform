/**
 * PR-3b — YooKassa renewal POST repeat policy (24h idempotence window).
 */

/** Documented YooKassa idempotence window; not a guarantee against duplicate charges after expiry. */
export const YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RenewalYooKassaPostRoute =
  | 'initial_post'
  | 'provider_get'
  | 'repeat_post'
  | 'needs_review'
  | 'blocked_invalid_first_post';

export function parseRenewalFirstPostAt(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const parsed = new Date(value as string | number);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function isWithinYookassaRenewalIdempotenceWindow(
  firstPostAt: Date,
  now: Date = new Date()
): boolean {
  const elapsedMs = now.getTime() - firstPostAt.getTime();
  if (!Number.isFinite(elapsedMs)) return false;
  if (elapsedMs < 0) return false;
  return elapsedMs <= YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS;
}

export function resolveRenewalYooKassaPostRoute(params: {
  providerPaymentId: string | null | undefined;
  firstPostAt: unknown;
  now?: Date;
}): RenewalYooKassaPostRoute {
  const providerId = params.providerPaymentId?.trim();
  if (providerId) {
    return 'provider_get';
  }

  const firstPostAt = parseRenewalFirstPostAt(params.firstPostAt);
  if (firstPostAt == null) {
    if (params.firstPostAt != null) {
      return 'blocked_invalid_first_post';
    }
    return 'initial_post';
  }

  const now = params.now ?? new Date();
  if (isWithinYookassaRenewalIdempotenceWindow(firstPostAt, now)) {
    return 'repeat_post';
  }
  return 'needs_review';
}
