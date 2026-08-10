/**
 * Client helpers for Premium subscription plan UI.
 * Catalog + pricing: subscriptionPlanCatalog.ts (shared with server).
 */

export {
  comparePlanTiers,
  DEFAULT_SUBSCRIPTION_PLAN,
  getPlanAmountRub,
  getPlanPriceCurrencyDisplay,
  getPlanCatalogEntry as getPlanDefinition,
  SUBSCRIPTION_PLAN_PRICE_CURRENCY,
  PLAN_CATALOG,
  PLAN_TIER_ORDER,
  SUBSCRIPTION_PLAN_CATALOG,
  SUBSCRIPTION_PLAN_PRICE_RUB,
  SUBSCRIPTION_PLAN_SLUGS,
  SUBSCRIPTION_SLOTS_LIMIT_FALLBACK,
  type SubscriptionPlanCatalogEntry as SubscriptionPlanDefinition,
  type SubscriptionPlanSlug,
} from './subscriptionPlanCatalog';

import {
  comparePlanTiers,
  getPlanAmountRub,
  PLAN_CATALOG,
  PLAN_TIER_ORDER,
  SUBSCRIPTION_PLAN_SLUGS,
  SUBSCRIPTION_SLOTS_LIMIT_FALLBACK,
  type SubscriptionPlanSlug,
} from './subscriptionPlanCatalog';

import type { BillingSnapshot } from '@shared/api/billing';

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

/** Prefer slotsLimit when it disagrees with billing.plan (e.g. after scheduled downgrade). */
export function resolveEffectiveSubscriptionPlanSlug(params: {
  billing: Pick<BillingSnapshot, 'plan'>;
  slotsLimit: number;
  slotsUsed: number;
  isPremium: boolean;
}): SubscriptionPlanSlug | null {
  const fromBilling = params.billing.plan;
  const fromSlots = resolvePlanSlugFromSlotsLimit(params.slotsLimit);

  if (fromBilling && fromSlots && fromBilling !== fromSlots) {
    return fromSlots;
  }

  return (
    fromBilling ??
    resolveCurrentPlanSlug({
      isPremium: params.isPremium,
      slotsLimit: params.slotsLimit,
      slotsUsed: params.slotsUsed,
    })
  );
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

export function formatPlanPricePeriod(_planSlug: SubscriptionPlanSlug, lang: 'en' | 'ru'): string {
  return lang === 'en' ? '/ month' : '/ мес.';
}

export function formatPlanSupportDuration(
  planSlug: SubscriptionPlanSlug,
  lang: 'en' | 'ru'
): string {
  const plan = PLAN_CATALOG[planSlug];
  return lang === 'en'
    ? `${plan.durationDays} days support period`
    : `${plan.durationDays} дней поддержки`;
}

export type PlanCardActionVariant = 'primary' | 'outline';

export type PlanCardBadge = 'current' | 'expired' | null;

export type ActiveScheduledPlanChange = {
  targetPlanSlug: SubscriptionPlanSlug;
  effectiveFrom: string;
};

/** Returns a pending scheduled plan change when it should appear in the plan picker. */
export function resolveActiveScheduledPlanChange(params: {
  scheduledPlan: SubscriptionPlanSlug | null;
  effectiveFrom: string | null;
  hasPremiumAccess: boolean;
  currentPlanSlug: SubscriptionPlanSlug | null;
  now?: number;
}): ActiveScheduledPlanChange | null {
  const { scheduledPlan, effectiveFrom, hasPremiumAccess, currentPlanSlug } = params;

  if (!scheduledPlan || !currentPlanSlug || !hasPremiumAccess) {
    return null;
  }

  if (scheduledPlan === currentPlanSlug) {
    return null;
  }

  if (!effectiveFrom) {
    return null;
  }

  const effectiveDate = new Date(effectiveFrom);
  if (Number.isNaN(effectiveDate.getTime())) {
    return null;
  }

  const now = params.now ?? Date.now();
  if (effectiveDate.getTime() <= now) {
    return null;
  }

  return {
    targetPlanSlug: scheduledPlan,
    effectiveFrom,
  };
}

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
  scheduledTargetPlanSlug?: SubscriptionPlanSlug | null;
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
  const scheduledTarget = params.scheduledTargetPlanSlug ?? null;

  if (scheduledTarget && params.planSlug === scheduledTarget) {
    return {
      label: params.lang === 'en' ? 'Cancel change' : 'Отменить смену',
      variant: 'outline',
      badge: null,
      disabled: false,
    };
  }

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
      label: params.lang === 'en' ? `Renew ${name}` : `Возобновить ${name}`,
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

export function resolveRecommendedPlanSlug(
  currentPlanSlug: SubscriptionPlanSlug | null
): SubscriptionPlanSlug | null {
  if (!currentPlanSlug) return null;

  const currentIndex = SUBSCRIPTION_PLAN_SLUGS.indexOf(currentPlanSlug);
  if (currentIndex < 0 || currentIndex >= SUBSCRIPTION_PLAN_SLUGS.length - 1) {
    return null;
  }

  return SUBSCRIPTION_PLAN_SLUGS[currentIndex + 1];
}

export function shouldConfirmSubscriptionPlanChange(
  currentPlanSlug: SubscriptionPlanSlug | null,
  targetPlanSlug: SubscriptionPlanSlug
): boolean {
  return currentPlanSlug !== null && currentPlanSlug !== targetPlanSlug;
}

/** True when clicking the plan card CTA proceeds directly to YooKassa checkout (not a confirm modal). */
export function shouldShowPlanCardCheckoutAutopaymentDisclosure(params: {
  planSlug: SubscriptionPlanSlug;
  currentPlanSlug: SubscriptionPlanSlug | null;
  scheduledTargetPlanSlug?: SubscriptionPlanSlug | null;
  isPremium: boolean;
}): boolean {
  const { planSlug, currentPlanSlug, scheduledTargetPlanSlug, isPremium } = params;

  if (scheduledTargetPlanSlug && planSlug === scheduledTargetPlanSlug) {
    return false;
  }

  const isCurrent = currentPlanSlug === planSlug;
  if (isCurrent && isPremium) {
    return false;
  }

  if (isCurrent && !isPremium) {
    return true;
  }

  if (!shouldConfirmSubscriptionPlanChange(currentPlanSlug, planSlug)) {
    return true;
  }

  return false;
}

export type PlanChangeAction = 'checkout' | 'upgrade' | 'downgrade' | 'blocked_downgrade';

export function resolvePlanChangeAction(params: {
  currentPlanSlug: SubscriptionPlanSlug | null;
  targetPlanSlug: SubscriptionPlanSlug;
  billingStatus: 'active' | 'cancel_at_period_end' | 'past_due' | 'expired' | null;
  hasPremiumAccess: boolean;
}): PlanChangeAction {
  const { currentPlanSlug, targetPlanSlug, billingStatus, hasPremiumAccess } = params;

  if (!shouldConfirmSubscriptionPlanChange(currentPlanSlug, targetPlanSlug)) {
    return 'checkout';
  }

  const tierCompare = comparePlanTiers(currentPlanSlug!, targetPlanSlug);

  if (!hasPremiumAccess || billingStatus === 'expired' || billingStatus === null) {
    return 'checkout';
  }

  if (billingStatus === 'past_due' && tierCompare > 0) {
    return 'blocked_downgrade';
  }

  if (billingStatus === 'active' || billingStatus === 'cancel_at_period_end') {
    if (tierCompare < 0) return 'upgrade';
    if (tierCompare > 0) return 'downgrade';
  }

  if (billingStatus === 'past_due' && tierCompare < 0) {
    return 'upgrade';
  }

  return 'checkout';
}
