/**
 * PR-10.3 — Read-only subscription lifecycle diagnostics for operations/debugging.
 */

import { resolveCollectionBillingOverlays } from '@features/premiumSubscription/lib/resolveCollectionBillingOverlays';
import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';
import type { BillingSnapshot } from '@shared/api/billing';

import { query } from './db';
import { buildBillingSnapshot } from './subscription-billing-snapshot';
import { getSubscriptionPaymentByProviderId } from './subscription-billing';
import {
  getSubscriptionInvariantViolations,
  type SubscriptionInvariantSnapshot,
} from './subscription-state';
import type { Subscription } from './subscriptions';
import { getViewerSubscription } from './subscriptions';

export type SubscriptionLifecyclePaymentRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: string;
  currency: string;
  plan: string | null;
  kind: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SubscriptionLifecycleArchiveRow = {
  artist_user_id: string;
  is_active: boolean;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SubscriptionLifecycleDiagnosticsDump = {
  generatedAt: string;
  userId: string;
  subscription: Subscription | null;
  payments: SubscriptionLifecyclePaymentRow[];
  billingSnapshot: BillingSnapshot | null;
  billingScreen: ReturnType<typeof resolveCollectionBillingScreen> | null;
  billingOverlays: ReturnType<typeof resolveCollectionBillingOverlays>;
  invariantViolations: string[];
  archive: {
    rows: SubscriptionLifecycleArchiveRow[];
    slotsUsed: number;
  };
};

function mapInvariantSnapshot(subscription: Subscription): SubscriptionInvariantSnapshot {
  return {
    status: subscription.status,
    expiresAt: subscription.expiresAt,
    paymentMethodId: subscription.paymentMethodId,
    nextChargeAt: subscription.nextChargeAt,
    renewalAttemptCount: subscription.renewalAttemptCount,
  };
}

async function loadPaymentsForUser(userId: string): Promise<SubscriptionLifecyclePaymentRow[]> {
  const result = await query<SubscriptionLifecyclePaymentRow>(
    `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount,
            currency, plan, kind, created_at, updated_at
     FROM subscription_payments
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );
  return result.rows;
}

async function loadArchiveRows(userId: string): Promise<SubscriptionLifecycleArchiveRow[]> {
  const result = await query<SubscriptionLifecycleArchiveRow>(
    `SELECT artist_user_id, is_active, locked_until, created_at, updated_at
     FROM user_archive
     WHERE user_id = $1::uuid
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows;
}

export type DumpSubscriptionLifecycleDiagnosticsOptions = {
  now?: Date;
};

/**
 * Read-only dump of subscription lifecycle state for a user.
 * Safe for ops scripts — does not mutate data.
 */
export async function dumpSubscriptionLifecycleDiagnostics(
  userId: string,
  options: DumpSubscriptionLifecycleDiagnosticsOptions = {}
): Promise<SubscriptionLifecycleDiagnosticsDump> {
  const now = options.now ?? new Date();
  const subscription = await getViewerSubscription(userId);
  const payments = await loadPaymentsForUser(userId);
  const archiveRows = await loadArchiveRows(userId);
  const slotsUsed = archiveRows.filter((row) => row.is_active).length;

  const billingSnapshot = subscription ? buildBillingSnapshot(subscription, { now }) : null;
  const billingScreen = billingSnapshot ? resolveCollectionBillingScreen(billingSnapshot) : null;
  const billingOverlays =
    billingSnapshot && billingScreen
      ? resolveCollectionBillingOverlays({
          billing: billingSnapshot,
          billingScreen,
          slotsUsed,
          now,
        })
      : [];

  const invariantViolations = subscription
    ? getSubscriptionInvariantViolations(mapInvariantSnapshot(subscription), now)
    : [];

  return {
    generatedAt: now.toISOString(),
    userId,
    subscription,
    payments,
    billingSnapshot,
    billingScreen,
    billingOverlays,
    invariantViolations,
    archive: {
      rows: archiveRows,
      slotsUsed,
    },
  };
}

/** Lookup diagnostics starting from a provider payment id (webhook/poll incidents). */
export async function dumpSubscriptionLifecycleDiagnosticsByProviderPaymentId(
  providerPaymentId: string,
  options: DumpSubscriptionLifecycleDiagnosticsOptions = {}
): Promise<SubscriptionLifecycleDiagnosticsDump | null> {
  const row = await getSubscriptionPaymentByProviderId(providerPaymentId);
  if (!row?.user_id) return null;
  return dumpSubscriptionLifecycleDiagnostics(row.user_id, options);
}
