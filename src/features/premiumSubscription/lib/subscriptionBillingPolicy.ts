import type { BillingSnapshot } from '@shared/api/billing';

const HOUR_MS = 60 * 60 * 1000;

/** ADR-007 — must match netlify/functions/lib/subscription-state.ts */
export const SUBSCRIPTION_GRACE_PERIOD_MS = 7 * 24 * HOUR_MS;

/** ADR-007 — must match netlify/functions/lib/subscription-state.ts */
export const MAX_RENEWAL_ATTEMPTS = 4;

export type DunningBannerSupplementKind = 'nextRetry' | 'graceEnd';

export type DunningBannerSupplement = {
  kind: DunningBannerSupplementKind;
  at: string;
};

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function resolveGraceEnd(firstFailedAt: string | null | undefined): string | null {
  const failedMs = parseIsoMs(firstFailedAt);
  if (failedMs === null) return null;
  return new Date(failedMs + SUBSCRIPTION_GRACE_PERIOD_MS).toISOString();
}

export function resolveDunningBannerSupplement(
  billing: Pick<BillingSnapshot, 'nextChargeAt' | 'firstFailedAt'>
): DunningBannerSupplement[] {
  const supplements: DunningBannerSupplement[] = [];

  if (billing.nextChargeAt) {
    supplements.push({ kind: 'nextRetry', at: billing.nextChargeAt });
  }

  const graceEnd = resolveGraceEnd(billing.firstFailedAt);
  if (graceEnd) {
    supplements.push({ kind: 'graceEnd', at: graceEnd });
  }

  return supplements.slice(0, 2);
}
