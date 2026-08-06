/**
 * Premium subscription display price — delegates to shared plan catalog.
 */

import { getPlanAmountRub, SUBSCRIPTION_PLAN_PRICE_RUB } from './subscriptionPlanCatalog';

export { SUBSCRIPTION_PLAN_PRICE_RUB };

/** @deprecated Use getPlanAmountRub(planSlug) — kept for legacy imports. */
export const PREMIUM_SUBSCRIPTION_AMOUNT_RUB_PRODUCTION = SUBSCRIPTION_PLAN_PRICE_RUB;

export function getPremiumSubscriptionAmountRub(): number {
  return getPlanAmountRub('explorer');
}

/** Price string for UI (modal, marketing copy). */
export function getPremiumSubscriptionPriceDisplayAmount(): string {
  return String(getPlanAmountRub('explorer'));
}
