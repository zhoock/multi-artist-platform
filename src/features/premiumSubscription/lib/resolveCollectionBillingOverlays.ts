import type { BillingSnapshot } from '@shared/api/billing';
import {
  getPlanDefinition,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';

import { BILLING_OVERLAY, type BillingOverlay } from './billingOverlay';
import type { BillingScreen } from './billingScreen';

export type ResolveCollectionBillingOverlaysInput = {
  billing: BillingSnapshot;
  billingScreen: BillingScreen;
  slotsUsed: number;
};

function hasExcessSlotsForScheduledDowngrade(billing: BillingSnapshot, slotsUsed: number): boolean {
  const scheduledPlan = billing.scheduledPlan;
  if (!scheduledPlan) return false;

  const scheduledLimit = getPlanDefinition(scheduledPlan as SubscriptionPlanSlug).slotsLimit;
  return slotsUsed > scheduledLimit;
}

function collectEligibleOverlays(input: ResolveCollectionBillingOverlaysInput): BillingOverlay[] {
  const { billing, billingScreen, slotsUsed } = input;

  if (
    billingScreen === 'NONE' ||
    billingScreen === 'PAYMENT_FAILED' ||
    billingScreen === 'EXPIRED'
  ) {
    return [];
  }

  const overlays: BillingOverlay[] = [];

  if (
    (billingScreen === 'ACTIVE' || billingScreen === 'CANCELLED') &&
    hasExcessSlotsForScheduledDowngrade(billing, slotsUsed)
  ) {
    overlays.push(BILLING_OVERLAY.DOWNGRADE_SLOTS);
  }

  return overlays;
}

/**
 * Returns overlay enums in fixed render order. UI must render the array as-is — no filtering or re-sorting.
 */
export function resolveCollectionBillingOverlays(
  input: ResolveCollectionBillingOverlaysInput
): BillingOverlay[] {
  return collectEligibleOverlays(input);
}
