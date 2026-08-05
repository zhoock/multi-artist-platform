/**
 * PR-10 failure diagnostics (spec §5).
 * Call from afterEach hooks or assertion helpers on mismatch.
 */

import type { BillingSnapshot } from '@shared/api/billing';

import { buildBillingSnapshot } from '../../subscription-billing-snapshot';
import {
  getSubscriptionInvariantViolations,
  type SubscriptionInvariantSnapshot,
} from '../../subscription-state';
import type { Subscription } from '../../subscriptions';
import type { E2eTestContext } from './subscription-e2e-fixtures';
import { getActiveE2eContext, setActiveE2eContext } from './subscription-e2e-context';

export type SubscriptionDiagnosticsDump = {
  context: E2eTestContext;
  subscription: Subscription | null;
  payments: Awaited<
    ReturnType<typeof import('./subscription-e2e-seed').loadSubscriptionPaymentsForUser>
  >;
  billingSnapshot: BillingSnapshot | null;
  invariantViolations: string[];
  archiveRows: ArchiveRowDump[];
};

export type ArchiveRowDump = {
  artist_user_id: string;
  is_active: boolean;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function mapToInvariantSnapshot(subscription: Subscription): SubscriptionInvariantSnapshot {
  return {
    status: subscription.status,
    expiresAt: subscription.expiresAt,
    paymentMethodId: subscription.paymentMethodId,
    nextChargeAt: subscription.nextChargeAt,
    renewalAttemptCount: subscription.renewalAttemptCount,
  };
}

async function loadArchiveRows(userId: string): Promise<ArchiveRowDump[]> {
  const { query } = await import('../../db');
  const result = await query<ArchiveRowDump>(
    `SELECT artist_user_id, is_active, locked_until, created_at, updated_at
     FROM user_archive
     WHERE user_id = $1::uuid
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows;
}

export async function dumpSubscriptionDiagnostics(
  ctx: E2eTestContext
): Promise<SubscriptionDiagnosticsDump> {
  const { loadSubscriptionForUser, loadSubscriptionPaymentsForUser } = await import(
    './subscription-e2e-seed'
  );

  const subscription = await loadSubscriptionForUser(ctx.userId);
  const payments = await loadSubscriptionPaymentsForUser(ctx.userId);
  const billingSnapshot = subscription
    ? buildBillingSnapshot(subscription, { now: ctx.frozenNow })
    : null;
  const invariantViolations = subscription
    ? getSubscriptionInvariantViolations(mapToInvariantSnapshot(subscription), ctx.frozenNow)
    : [];
  const archiveRows = await loadArchiveRows(ctx.userId);

  const dump: SubscriptionDiagnosticsDump = {
    context: ctx,
    subscription,
    payments,
    billingSnapshot,
    invariantViolations,
    archiveRows,
  };

  // eslint-disable-next-line no-console -- intentional test diagnostics
  console.error('[PR-10 E2E diagnostics]', JSON.stringify(dump, null, 2));

  return dump;
}

/** Tracks the active scenario context for afterEach failure dumps. */
export { getActiveE2eContext, setActiveE2eContext } from './subscription-e2e-context';

export async function dumpActiveContextOnFailure(): Promise<void> {
  const activeContext = getActiveE2eContext();
  if (activeContext) {
    await dumpSubscriptionDiagnostics(activeContext);
  }
}
