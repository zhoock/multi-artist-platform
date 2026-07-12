/**
 * Client-side mirror of netlify/functions/lib/subscription-billing.ts PLAN_CATALOG.
 * Keep in sync when changing server plan definitions.
 */

import { isPremiumSubscriptionDevTestPricing } from './premiumSubscriptionPricing';

export const SUBSCRIPTION_PLAN_SLUGS = ['explorer', 'collector', 'archivist'] as const;
export type SubscriptionPlanSlug = (typeof SUBSCRIPTION_PLAN_SLUGS)[number];

export const DEFAULT_SUBSCRIPTION_PLAN: SubscriptionPlanSlug = 'explorer';

/** Matches backend fallback when user has no subscription row. */
export const SUBSCRIPTION_SLOTS_LIMIT_FALLBACK = 3;

export interface SubscriptionPlanDefinition {
  slotsLimit: number;
  durationHours: number;
  durationDays?: number;
  priceRubProduction: number;
}

// DEVELOPMENT VALUES.
// Replace before production:
//
// Explorer:  20 artists / 30 days
// Collector: 60 artists / 30 days
// Archivist: 100 artists / 30 days
export const PLAN_CATALOG: Record<SubscriptionPlanSlug, SubscriptionPlanDefinition> = {
  explorer: {
    slotsLimit: 1,
    durationHours: 1,
    priceRubProduction: 149,
  },
  collector: {
    slotsLimit: 2,
    durationHours: 1,
    priceRubProduction: 149,
  },
  archivist: {
    slotsLimit: 3,
    durationHours: 1,
    priceRubProduction: 149,
  },
};

export const PLAN_TIER_ORDER: Record<SubscriptionPlanSlug, number> = {
  explorer: 0,
  collector: 1,
  archivist: 2,
};

export function getPlanDefinition(planSlug: SubscriptionPlanSlug): SubscriptionPlanDefinition {
  return PLAN_CATALOG[planSlug];
}

export function getPlanAmountRub(planSlug: SubscriptionPlanSlug): number {
  if (isPremiumSubscriptionDevTestPricing()) return 1;
  return PLAN_CATALOG[planSlug].priceRubProduction;
}

export function getPlanPriceDisplayAmount(planSlug: SubscriptionPlanSlug): string {
  return String(getPlanAmountRub(planSlug));
}

export function getPlanDisplayName(planSlug: SubscriptionPlanSlug): string {
  const names: Record<SubscriptionPlanSlug, string> = {
    explorer: 'Explorer',
    collector: 'Collector',
    archivist: 'Archivist',
  };
  return names[planSlug];
}

export function resolvePlanSlugFromSlotsLimit(slotsLimit: number): SubscriptionPlanSlug | null {
  for (const slug of SUBSCRIPTION_PLAN_SLUGS) {
    if (PLAN_CATALOG[slug].slotsLimit === slotsLimit) return slug;
  }
  return null;
}

export function resolveCurrentPlanSlug(params: {
  isPremium: boolean;
  slotsLimit: number;
  slotsUsed: number;
}): SubscriptionPlanSlug | null {
  const resolved = resolvePlanSlugFromSlotsLimit(params.slotsLimit);
  if (!resolved) return null;
  if (params.isPremium) return resolved;
  if (params.slotsUsed > 0) return resolved;
  if (
    params.slotsLimit === SUBSCRIPTION_SLOTS_LIMIT_FALLBACK &&
    params.slotsUsed === 0 &&
    resolved === 'archivist'
  ) {
    return null;
  }
  if (resolved === 'explorer' || resolved === 'collector') return resolved;
  return null;
}

export function isCollectionOverPlanLimit(slotsUsed: number, slotsLimit: number): boolean {
  return slotsLimit > 0 && slotsUsed > slotsLimit;
}

export function formatPlanStatusLabel(
  planSlug: SubscriptionPlanSlug,
  isPremium: boolean,
  lang: 'en' | 'ru'
): string {
  const name = getPlanDisplayName(planSlug);
  if (lang === 'ru') {
    return isPremium ? `${name} · активная поддержка` : `${name} · поддержка неактивна`;
  }
  return isPremium ? `${name} · Active support` : `${name} · Support inactive`;
}

export function formatCollectionMenuArtistCount(count: number, lang: 'en' | 'ru'): string {
  if (lang === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${count} артистов`;
    if (mod10 === 1) return `${count} артист`;
    if (mod10 >= 2 && mod10 <= 4) return `${count} артиста`;
    return `${count} артистов`;
  }
  return count === 1 ? `${count} artist` : `${count} artists`;
}

export function formatCollectionMenuSubtitle(
  planSlug: SubscriptionPlanSlug | null,
  slotsUsed: number,
  lang: 'en' | 'ru'
): string {
  if (!planSlug) {
    return lang === 'ru' ? 'Нет активного плана' : 'No active plan';
  }
  return `${getPlanDisplayName(planSlug)} • ${formatCollectionMenuArtistCount(slotsUsed, lang)}`;
}

export function formatPlanArtistLimitParts(
  planSlug: SubscriptionPlanSlug,
  lang: 'en' | 'ru'
): { prefix: string; count: string; suffix: string } {
  const count = PLAN_CATALOG[planSlug].slotsLimit;
  if (lang === 'ru') {
    return {
      prefix: 'До',
      count: String(count),
      suffix: count === 1 ? 'артиста' : 'артистов',
    };
  }
  return {
    prefix: 'Up to',
    count: String(count),
    suffix: count === 1 ? 'artist' : 'artists',
  };
}

/** @deprecated Use formatPlanArtistLimitParts for plan card layout. */
export function formatPlanArtistLimit(planSlug: SubscriptionPlanSlug, lang: 'en' | 'ru'): string {
  const { prefix, count, suffix } = formatPlanArtistLimitParts(planSlug, lang);
  return `${prefix} ${count} ${suffix}`;
}

export function formatPlanPricePeriod(planSlug: SubscriptionPlanSlug, lang: 'en' | 'ru'): string {
  const plan = PLAN_CATALOG[planSlug];
  if (plan.durationDays != null) {
    return lang === 'en' ? '/ month' : '/ мес.';
  }
  const hours = plan.durationHours;
  if (lang === 'en') {
    return hours === 1 ? '/ hour' : `/ ${hours} hours`;
  }
  return hours === 1 ? '/ час' : `/ ${hours} ч`;
}

export function formatPlanSupportDuration(
  planSlug: SubscriptionPlanSlug,
  lang: 'en' | 'ru'
): string {
  const plan = PLAN_CATALOG[planSlug];
  if (plan.durationDays != null) {
    return lang === 'en'
      ? `${plan.durationDays} days support period`
      : `${plan.durationDays} дней поддержки`;
  }
  const hours = plan.durationHours;
  if (lang === 'en') {
    return hours === 1 ? '1 hour support period' : `${hours} hours support period`;
  }
  return hours === 1 ? '1 час поддержки' : `${hours} ч поддержки`;
}

export function getPlanHighlightFeature(planSlug: SubscriptionPlanSlug, lang: 'en' | 'ru'): string {
  const labels: Record<SubscriptionPlanSlug, { en: string; ru: string }> = {
    explorer: { en: 'Curated collection', ru: 'Кураторская коллекция' },
    collector: { en: 'Larger collection', ru: 'Большая коллекция' },
    archivist: { en: 'Maximum collection size', ru: 'Максимальный размер коллекции' },
  };
  return labels[planSlug][lang];
}

export type PlanCardActionVariant = 'primary' | 'outline';

export type PlanCardBadge = 'current' | 'expired' | null;

export function getPlanCardBadgeLabel(badge: PlanCardBadge, lang: 'en' | 'ru'): string | null {
  if (badge === 'current') {
    return lang === 'en' ? 'Current Plan' : 'Текущий план';
  }
  if (badge === 'expired') {
    return lang === 'en' ? 'Expired' : 'Истёк';
  }
  return null;
}

export function resolvePlanCardAction(params: {
  planSlug: SubscriptionPlanSlug;
  currentPlanSlug: SubscriptionPlanSlug | null;
  isPremium: boolean;
  lang: 'en' | 'ru';
}): {
  label: string;
  variant: PlanCardActionVariant;
  badge: PlanCardBadge;
  disabled: boolean;
} {
  const name = getPlanDisplayName(params.planSlug);
  const isCurrent = params.currentPlanSlug === params.planSlug;

  if (isCurrent) {
    if (params.isPremium) {
      return {
        label: params.lang === 'en' ? 'Current Plan' : 'Текущий план',
        variant: 'outline',
        badge: 'current',
        disabled: true,
      };
    }
    return {
      label: params.lang === 'en' ? `Renew ${name}` : `Продлить ${name}`,
      variant: 'outline',
      badge: 'expired',
      disabled: false,
    };
  }

  if (params.currentPlanSlug) {
    return {
      label: params.lang === 'en' ? `Switch to ${name}` : `Перейти на ${name}`,
      variant: 'outline',
      badge: null,
      disabled: false,
    };
  }

  return {
    label: params.lang === 'en' ? `Choose ${name}` : `Выбрать ${name}`,
    variant: 'outline',
    badge: null,
    disabled: false,
  };
}

export function comparePlanTiers(a: SubscriptionPlanSlug, b: SubscriptionPlanSlug): -1 | 0 | 1 {
  const diff = PLAN_TIER_ORDER[a] - PLAN_TIER_ORDER[b];
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/** True when switching between existing plans (not renew / first purchase). */
export function shouldConfirmSubscriptionPlanChange(
  currentPlanSlug: SubscriptionPlanSlug | null,
  targetPlanSlug: SubscriptionPlanSlug
): boolean {
  return currentPlanSlug !== null && currentPlanSlug !== targetPlanSlug;
}
