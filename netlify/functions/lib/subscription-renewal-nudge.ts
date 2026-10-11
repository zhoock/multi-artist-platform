/**
 * Idempotent renewal charge nudge on read paths (e.g. GET /api/my-archive).
 * Uses the same claim + attempt pipeline as the scheduled handler — no extra payment rows.
 */

import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import { resolveSchedulerRunMode } from './subscription-renewal-scheduler-mode';
import {
  attemptRenewalChargeForSubscription,
  listChargeReadySubscriptionIds,
  reconcileRenewalClaimBlockers,
} from './subscription-renewal-engine';
import { getViewerSubscription } from './subscriptions';

export async function nudgeRenewalChargeIfDueForUser(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  if (!isSubscriptionAutoRenewEnabled()) return;
  if (resolveSchedulerRunMode().mode !== 'live') return;

  const subscription = await getViewerSubscription(userId);
  if (!subscription?.id) return;

  const chargeReadyIds = await listChargeReadySubscriptionIds(now);
  if (!chargeReadyIds.includes(subscription.id)) return;

  await reconcileRenewalClaimBlockers(subscription.id);
  await attemptRenewalChargeForSubscription(subscription.id, now);
}
