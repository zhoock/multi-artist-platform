/**
 * PATCH subscription auto-renew (PR-5): merchant-side enable/disable transitions.
 */

import { buildBillingSnapshot, type BillingSnapshot } from './subscription-billing-snapshot';
import { isMissingRelationError, query } from './db';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import {
  getNextSubscriptionStatus,
  InvalidSubscriptionTransitionError,
  toPresenceStatus,
} from './subscription-state';
import {
  getViewerSubscription,
  mapSubscriptionRow,
  type Subscription,
  type SubscriptionRow,
} from './subscriptions';

export class SubscriptionAutoRenewPatchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'SubscriptionAutoRenewPatchError';
  }
}

export type PatchSubscriptionAutoRenewResult = {
  subscription: Subscription;
  billing: BillingSnapshot;
};

export async function patchSubscriptionAutoRenew(
  userId: string,
  autoRenewEnabled: boolean
): Promise<PatchSubscriptionAutoRenewResult> {
  if (!isSubscriptionAutoRenewEnabled()) {
    throw new SubscriptionAutoRenewPatchError('Auto-renew is not enabled', 'FEATURE_DISABLED', 503);
  }

  const subscription = await getViewerSubscription(userId);
  if (!subscription) {
    throw new SubscriptionAutoRenewPatchError('Subscription not found', 'NO_SUBSCRIPTION', 404);
  }

  const presence = toPresenceStatus(subscription);
  const event = autoRenewEnabled ? 'USER_ENABLE_AUTO_RENEW' : 'USER_DISABLE_AUTO_RENEW';
  const hasPaymentMethod = Boolean(subscription.paymentMethodId?.trim());

  let nextStatus;
  try {
    nextStatus = getNextSubscriptionStatus(presence, event, { hasPaymentMethod });
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) {
      if (autoRenewEnabled && !hasPaymentMethod) {
        throw new SubscriptionAutoRenewPatchError(
          'Payment method required to enable auto-renew',
          'PAYMENT_METHOD_REQUIRED',
          409
        );
      }
      throw new SubscriptionAutoRenewPatchError(error.message, 'INVALID_TRANSITION', 409);
    }
    throw error;
  }

  const nextChargeAt = autoRenewEnabled ? subscription.expiresAt : null;

  try {
    const updated = await query<SubscriptionRow>(
      `UPDATE subscriptions
       SET status = $2,
           next_charge_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $4::uuid
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
      [subscription.id, nextStatus, nextChargeAt, userId]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new SubscriptionAutoRenewPatchError('Subscription update failed', 'UPDATE_FAILED', 500);
    }

    const nextSubscription = mapSubscriptionRow(row);
    return {
      subscription: nextSubscription,
      billing: buildBillingSnapshot(nextSubscription),
    };
  } catch (error) {
    if (error instanceof SubscriptionAutoRenewPatchError) throw error;
    if (isMissingRelationError(error)) {
      throw new SubscriptionAutoRenewPatchError(
        'Subscriptions table missing',
        'SCHEMA_MISSING',
        503
      );
    }
    throw error;
  }
}
