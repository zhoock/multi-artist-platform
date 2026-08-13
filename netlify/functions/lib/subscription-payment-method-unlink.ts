/**
 * Unlink saved Premium payment method (YooKassa merchant-side revocation).
 * Clears payment_method_id/title; disables auto-renew when status is active.
 */

import type { PoolClient } from 'pg';

import { cancelOrphanPendingRenewalPayments } from './subscription-billing';
import { buildBillingSnapshot, type BillingSnapshot } from './subscription-billing-snapshot';
import { isMissingRelationError, withTransaction } from './db';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import {
  getNextSubscriptionStatus,
  InvalidSubscriptionTransitionError,
  toPresenceStatus,
} from './subscription-state';
import { mapSubscriptionRow, type Subscription, type SubscriptionRow } from './subscriptions';

export class SubscriptionPaymentMethodUnlinkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'SubscriptionPaymentMethodUnlinkError';
  }
}

export type UnlinkSubscriptionPaymentMethodResult = {
  subscription: Subscription;
  billing: BillingSnapshot;
  /** False when PM was already absent (idempotent no-op). */
  unlinked: boolean;
};

const SUBSCRIPTION_RETURNING = `
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
  payment_method_title,
  next_charge_at,
  renewal_attempt_count,
  scheduled_plan,
  first_failed_at,
  payment_method_epoch,
  created_at,
  updated_at`;

function hasStoredPaymentMethod(row: SubscriptionRow): boolean {
  return Boolean(row.payment_method_id?.trim()) || Boolean(row.payment_method_title?.trim());
}

/** Same transition as PATCH auto-renew disable for active subscriptions. */
function resolveStatusAfterUnlink(row: SubscriptionRow): SubscriptionRow['status'] {
  if (row.status !== 'active') return row.status;

  const presence = toPresenceStatus(mapSubscriptionRow(row));
  try {
    return getNextSubscriptionStatus(presence, 'USER_DISABLE_AUTO_RENEW');
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) {
      throw new SubscriptionPaymentMethodUnlinkError(error.message, 'INVALID_TRANSITION', 409);
    }
    throw error;
  }
}

async function loadSubscriptionForUpdate(
  client: PoolClient,
  userId: string
): Promise<SubscriptionRow | null> {
  const result = await client.query<SubscriptionRow>(
    `SELECT ${SUBSCRIPTION_RETURNING.replace(/\n\s+/g, ' ')}
     FROM subscriptions
     WHERE user_id = $1::uuid
     FOR UPDATE`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function unlinkSubscriptionPaymentMethod(
  userId: string
): Promise<UnlinkSubscriptionPaymentMethodResult> {
  if (!isSubscriptionAutoRenewEnabled()) {
    throw new SubscriptionPaymentMethodUnlinkError(
      'Payment method unlink is not enabled',
      'FEATURE_DISABLED',
      503
    );
  }

  try {
    return await withTransaction(async (client) => {
      const row = await loadSubscriptionForUpdate(client, userId);
      if (!row) {
        throw new SubscriptionPaymentMethodUnlinkError(
          'Subscription not found',
          'NO_SUBSCRIPTION',
          404
        );
      }

      if (!hasStoredPaymentMethod(row)) {
        const subscription = mapSubscriptionRow(row);
        return {
          subscription,
          billing: buildBillingSnapshot(subscription),
          unlinked: false,
        };
      }

      const nextStatus = resolveStatusAfterUnlink(row);

      const updated = await client.query<SubscriptionRow>(
        `UPDATE subscriptions
         SET payment_method_id = NULL,
             payment_method_title = NULL,
             next_charge_at = NULL,
             status = $2,
             payment_method_epoch = payment_method_epoch + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
           AND user_id = $3::uuid
         RETURNING ${SUBSCRIPTION_RETURNING}`,
        [row.id, nextStatus, userId]
      );

      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        throw new SubscriptionPaymentMethodUnlinkError(
          'Subscription update failed',
          'UPDATE_FAILED',
          500
        );
      }

      await cancelOrphanPendingRenewalPayments(userId);

      const subscription = mapSubscriptionRow(updatedRow);
      return {
        subscription,
        billing: buildBillingSnapshot(subscription),
        unlinked: true,
      };
    });
  } catch (error) {
    if (error instanceof SubscriptionPaymentMethodUnlinkError) throw error;
    if (isMissingRelationError(error)) {
      throw new SubscriptionPaymentMethodUnlinkError(
        'Subscriptions table missing',
        'SCHEMA_MISSING',
        503
      );
    }
    throw error;
  }
}
