/**
 * Single source of truth for Premium subscription plan catalog (slots, duration, price).
 *
 * Imported by:
 * - netlify/functions/lib/subscription-billing.ts (checkout + renewal amounts)
 * - src/shared/lib/payment/subscriptionPlans.ts (client display helpers)
 */

export const SUBSCRIPTION_PLAN_SLUGS = ['explorer', 'collector', 'archivist'] as const;
export type SubscriptionPlanSlug = (typeof SUBSCRIPTION_PLAN_SLUGS)[number];

export const DEFAULT_SUBSCRIPTION_PLAN: SubscriptionPlanSlug = 'explorer';

/**
 * TEMP (billing QA): all plans charge 1 ₽ until production pricing is re-enabled.
 * Restore 149 / 149 / 199 when YooKassa + autoprenew verification is complete.
 */
export const SUBSCRIPTION_PLAN_PRICE_RUB = 1;

/** Display symbol for subscription checkout (RUB-only via YooKassa). */
export const SUBSCRIPTION_PLAN_PRICE_CURRENCY = '₽';

/** ISO currency code for YooKassa / subscription_payments rows. */
export const SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE = 'RUB' as const;

export interface SubscriptionPlanCatalogEntry {
  slotsLimit: number;
  durationDays: number;
  priceRubProduction: number;
}

/** Plan catalog — 30-day billing period display; dev support period length is server-only. */
export const SUBSCRIPTION_PLAN_CATALOG: Record<SubscriptionPlanSlug, SubscriptionPlanCatalogEntry> =
  {
    explorer: {
      slotsLimit: 20,
      durationDays: 30,
      priceRubProduction: SUBSCRIPTION_PLAN_PRICE_RUB,
    },
    collector: {
      slotsLimit: 60,
      durationDays: 30,
      priceRubProduction: SUBSCRIPTION_PLAN_PRICE_RUB,
    },
    archivist: {
      slotsLimit: 100,
      durationDays: 30,
      priceRubProduction: SUBSCRIPTION_PLAN_PRICE_RUB,
    },
  };

/** @deprecated Prefer SUBSCRIPTION_PLAN_CATALOG — alias for existing imports. */
export const PLAN_CATALOG = SUBSCRIPTION_PLAN_CATALOG;

export const SUBSCRIPTION_SLOTS_LIMIT_FALLBACK = SUBSCRIPTION_PLAN_CATALOG.archivist.slotsLimit;

export const PLAN_TIER_ORDER: Record<SubscriptionPlanSlug, number> = {
  explorer: 0,
  collector: 1,
  archivist: 2,
};

export function normalizeSubscriptionPlanSlug(
  plan: string | null | undefined
): SubscriptionPlanSlug | null {
  if (!plan?.trim()) return null;
  const trimmed = plan.trim();
  if ((SUBSCRIPTION_PLAN_SLUGS as readonly string[]).includes(trimmed)) {
    return trimmed as SubscriptionPlanSlug;
  }
  return null;
}

export function isSubscriptionPlanSlug(
  plan: string | null | undefined
): plan is SubscriptionPlanSlug {
  return normalizeSubscriptionPlanSlug(plan) !== null;
}

export function getPlanCatalogEntry(planSlug: SubscriptionPlanSlug): SubscriptionPlanCatalogEntry {
  return SUBSCRIPTION_PLAN_CATALOG[planSlug];
}

export function getPlanSlotsLimit(planSlug: SubscriptionPlanSlug): number {
  return SUBSCRIPTION_PLAN_CATALOG[planSlug].slotsLimit;
}

export function getPlanAmountRub(planSlug: SubscriptionPlanSlug): number {
  return SUBSCRIPTION_PLAN_CATALOG[planSlug].priceRubProduction;
}

/** YooKassa amount.value string for a plan (e.g. `"1.00"`). */
export function formatPlanAmountValue(planSlug: SubscriptionPlanSlug): string {
  return getPlanAmountRub(planSlug).toFixed(2);
}

export function getPlanPriceCurrencyDisplay(): string {
  return SUBSCRIPTION_PLAN_PRICE_CURRENCY;
}

export function getPlanPriceCurrencyCode(): typeof SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE {
  return SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE;
}

export function isSubscriptionPlanCurrency(
  currency: string | null | undefined
): currency is typeof SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE {
  return currency?.trim().toUpperCase() === SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE;
}

export function comparePlanTiers(a: SubscriptionPlanSlug, b: SubscriptionPlanSlug): -1 | 0 | 1 {
  const diff = PLAN_TIER_ORDER[a] - PLAN_TIER_ORDER[b];
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}
