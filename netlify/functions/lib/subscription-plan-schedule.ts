/**
 * Schedule / cancel downgrade (PR-6, ADR-006).
 * No payment, no subscription_payments row — only scheduled_plan.
 */

import { hasPremiumAccess } from './subscription-access';
import { buildBillingSnapshot, type BillingSnapshot } from './subscription-billing-snapshot';
import {
  comparePlanTiers,
  normalizeSubscriptionPlanSlug,
  type SubscriptionPlanSlug,
} from './subscription-billing';
import { isMissingRelationError, query } from './db';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import {
  emitSubscriptionMetric,
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
  SUBSCRIPTION_METRICS,
} from './subscription-observability';
import { normalizeCanonicalStatus, toPresenceStatus } from './subscription-state';
import {
  getViewerSubscription,
  mapSubscriptionRow,
  type Subscription,
  type SubscriptionRow,
} from './subscriptions';

export class SubscriptionPlanScheduleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'SubscriptionPlanScheduleError';
  }
}

export type SubscriptionPlanScheduleResult = {
  subscription: Subscription;
  billing: BillingSnapshot;
};

const SCHEDULE_DOWNGRADE_STATUSES = new Set(['active', 'cancel_at_period_end']);

function assertScheduleDowngradeAllowed(subscription: Subscription): void {
  const canonical = normalizeCanonicalStatus(subscription.status);
  if (!canonical || !SCHEDULE_DOWNGRADE_STATUSES.has(canonical)) {
    throw new SubscriptionPlanScheduleError(
      'Downgrade can only be scheduled during an active paid period',
      'INVALID_STATUS',
      409
    );
  }

  if (!hasPremiumAccess(subscription)) {
    throw new SubscriptionPlanScheduleError(
      'Premium access is required to schedule a downgrade',
      'NO_PREMIUM_ACCESS',
      409
    );
  }
}

export async function scheduleSubscriptionDowngrade(
  userId: string,
  targetPlanSlug: SubscriptionPlanSlug
): Promise<SubscriptionPlanScheduleResult> {
  if (!isSubscriptionAutoRenewEnabled()) {
    throw new SubscriptionPlanScheduleError(
      'Plan scheduling is not enabled',
      'FEATURE_DISABLED',
      503
    );
  }

  const subscription = await getViewerSubscription(userId);
  if (!subscription) {
    throw new SubscriptionPlanScheduleError('Subscription not found', 'NO_SUBSCRIPTION', 404);
  }

  assertScheduleDowngradeAllowed(subscription);

  const currentPlanSlug = normalizeSubscriptionPlanSlug(subscription.plan);
  if (!currentPlanSlug) {
    throw new SubscriptionPlanScheduleError('Current plan is invalid', 'INVALID_PLAN', 409);
  }

  if (comparePlanTiers(targetPlanSlug, currentPlanSlug) >= 0) {
    throw new SubscriptionPlanScheduleError(
      'Target plan must be lower than the current plan',
      'NOT_A_DOWNGRADE',
      409
    );
  }

  try {
    const updated = await query<SubscriptionRow>(
      `UPDATE subscriptions
       SET scheduled_plan = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $3::uuid
       RETURNING
         id,
         user_id,
         status,
         plan,
         slots_limit,
         provider,
         provider_subscription_id,
         started_at,
         expires_at,
         payment_method_id,
         next_charge_at,
         renewal_attempt_count,
         scheduled_plan,
         first_failed_at,
         created_at,
         updated_at`,
      [subscription.id, targetPlanSlug, userId]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new SubscriptionPlanScheduleError('Subscription update failed', 'UPDATE_FAILED', 500);
    }

    const nextSubscription = mapSubscriptionRow(row);
    extendSubscriptionObservability({
      userId,
      subscriptionId: nextSubscription.id,
      kind: 'scheduled_downgrade',
      source: 'scheduled_plan',
    });
    emitSubscriptionMetric(SUBSCRIPTION_METRICS.SCHEDULED_DOWNGRADE_APPLIED);
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULED_DOWNGRADE_APPLIED, {
      statusBefore: subscription.status,
      statusAfter: nextSubscription.status,
      targetPlanSlug,
      scheduledPlan: nextSubscription.scheduledPlan,
    });
    return {
      subscription: nextSubscription,
      billing: buildBillingSnapshot(nextSubscription),
    };
  } catch (error) {
    if (error instanceof SubscriptionPlanScheduleError) throw error;
    if (isMissingRelationError(error)) {
      throw new SubscriptionPlanScheduleError('Subscriptions table missing', 'SCHEMA_MISSING', 503);
    }
    throw error;
  }
}

export async function cancelScheduledSubscriptionDowngrade(
  userId: string
): Promise<SubscriptionPlanScheduleResult> {
  if (!isSubscriptionAutoRenewEnabled()) {
    throw new SubscriptionPlanScheduleError(
      'Plan scheduling is not enabled',
      'FEATURE_DISABLED',
      503
    );
  }

  const subscription = await getViewerSubscription(userId);
  if (!subscription) {
    throw new SubscriptionPlanScheduleError('Subscription not found', 'NO_SUBSCRIPTION', 404);
  }

  if (!subscription.scheduledPlan?.trim()) {
    throw new SubscriptionPlanScheduleError(
      'No scheduled plan change to cancel',
      'NO_SCHEDULED_PLAN',
      409
    );
  }

  try {
    const updated = await query<SubscriptionRow>(
      `UPDATE subscriptions
       SET scheduled_plan = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
       RETURNING
         id,
         user_id,
         status,
         plan,
         slots_limit,
         provider,
         provider_subscription_id,
         started_at,
         expires_at,
         payment_method_id,
         next_charge_at,
         renewal_attempt_count,
         scheduled_plan,
         first_failed_at,
         created_at,
         updated_at`,
      [subscription.id, userId]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new SubscriptionPlanScheduleError('Subscription update failed', 'UPDATE_FAILED', 500);
    }

    const nextSubscription = mapSubscriptionRow(row);
    return {
      subscription: nextSubscription,
      billing: buildBillingSnapshot(nextSubscription),
    };
  } catch (error) {
    if (error instanceof SubscriptionPlanScheduleError) throw error;
    if (isMissingRelationError(error)) {
      throw new SubscriptionPlanScheduleError('Subscriptions table missing', 'SCHEMA_MISSING', 503);
    }
    throw error;
  }
}

/** Validates upgrade checkout preconditions (used by create-subscription-payment). */
export function assertUpgradeCheckoutAllowed(
  subscription: Subscription,
  targetPlanSlug: SubscriptionPlanSlug
): void {
  const presence = toPresenceStatus(subscription);
  if (presence !== 'active' && presence !== 'cancel_at_period_end' && presence !== 'past_due') {
    throw new SubscriptionPlanScheduleError(
      'Upgrade checkout is not allowed for this subscription state',
      'INVALID_STATUS',
      409
    );
  }

  const currentPlanSlug = normalizeSubscriptionPlanSlug(subscription.plan);
  if (!currentPlanSlug) {
    throw new SubscriptionPlanScheduleError('Current plan is invalid', 'INVALID_PLAN', 409);
  }

  if (comparePlanTiers(targetPlanSlug, currentPlanSlug) <= 0) {
    throw new SubscriptionPlanScheduleError(
      'Target plan must be higher than the current plan',
      'NOT_AN_UPGRADE',
      409
    );
  }
}

const MID_CYCLE_UPGRADE_PRESENCE = new Set(['active', 'cancel_at_period_end', 'past_due']);

/**
 * Blocks initial checkout when mid-cycle upgrade must use intent=upgrade (PR-6 guard).
 */
export function assertUpgradeIntentRequiredForMidCycleUpgrade(
  subscription: Subscription,
  targetPlanSlug: SubscriptionPlanSlug
): void {
  const presence = toPresenceStatus(subscription);
  if (!MID_CYCLE_UPGRADE_PRESENCE.has(presence)) {
    return;
  }

  const currentPlanSlug = normalizeSubscriptionPlanSlug(subscription.plan);
  if (!currentPlanSlug) {
    return;
  }

  if (comparePlanTiers(targetPlanSlug, currentPlanSlug) > 0) {
    throw new SubscriptionPlanScheduleError(
      'Mid-cycle plan upgrade requires intent=upgrade checkout',
      'UPGRADE_INTENT_REQUIRED',
      409
    );
  }
}
