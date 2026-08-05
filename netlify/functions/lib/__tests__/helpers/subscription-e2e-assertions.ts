/**
 * PR-10 shared assertion helpers (spec §6).
 * Used by tier1/tier3 integration scenarios when implemented.
 */

import { expect } from '@jest/globals';
import type { BillingSnapshot } from '@shared/api/billing';

import type { SubscriptionPlanSlug } from '../../subscription-billing';
import { buildBillingSnapshot } from '../../subscription-billing-snapshot';
import {
  getSubscriptionInvariantViolations,
  type SubscriptionInvariantSnapshot,
} from '../../subscription-state';
import type { Subscription, SubscriptionStatus } from '../../subscriptions';
import type { E2eTestContext } from './subscription-e2e-fixtures';
import {
  dumpSubscriptionDiagnostics,
  mapToInvariantSnapshot,
} from './subscription-e2e-diagnostics';

export type ExpectedSubscriptionState = Partial<{
  status: SubscriptionStatus;
  plan: SubscriptionPlanSlug | string;
  slotsLimit: number;
  paymentMethodId: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: Date | null;
  scheduledPlan: string | null;
  renewalAttemptCount: number;
  firstFailedAt: Date | null;
  expiresAt: Date;
  providerSubscriptionId: string | null;
}>;

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function maybeDump(ctx?: E2eTestContext): Promise<void> {
  if (ctx) {
    await dumpSubscriptionDiagnostics(ctx);
  }
}

export async function expectSubscriptionState(
  subscription: Subscription | null,
  expected: ExpectedSubscriptionState,
  options?: { now?: Date; context?: E2eTestContext }
): Promise<void> {
  if (!subscription) {
    await maybeDump(options?.context);
    expect(subscription).not.toBeNull();
    return;
  }

  try {
    if (expected.status !== undefined) {
      expect(subscription.status).toBe(expected.status);
    }
    if (expected.plan !== undefined) {
      expect(subscription.plan).toBe(expected.plan);
    }
    if (expected.slotsLimit !== undefined) {
      expect(subscription.slotsLimit).toBe(expected.slotsLimit);
    }
    if (expected.paymentMethodId !== undefined) {
      expect(subscription.paymentMethodId ?? null).toBe(expected.paymentMethodId);
    }
    if (expected.paymentMethodTitle !== undefined) {
      expect(subscription.paymentMethodTitle ?? null).toBe(expected.paymentMethodTitle);
    }
    if (expected.nextChargeAt !== undefined) {
      expect(normalizeDate(subscription.nextChargeAt)).toBe(normalizeDate(expected.nextChargeAt));
    }
    if (expected.scheduledPlan !== undefined) {
      expect(subscription.scheduledPlan ?? null).toBe(expected.scheduledPlan);
    }
    if (expected.renewalAttemptCount !== undefined) {
      expect(subscription.renewalAttemptCount ?? 0).toBe(expected.renewalAttemptCount);
    }
    if (expected.firstFailedAt !== undefined) {
      expect(normalizeDate(subscription.firstFailedAt)).toBe(normalizeDate(expected.firstFailedAt));
    }
    if (expected.expiresAt !== undefined) {
      expect(normalizeDate(subscription.expiresAt)).toBe(normalizeDate(expected.expiresAt));
    }
    if (expected.providerSubscriptionId !== undefined) {
      expect(subscription.providerSubscriptionId ?? null).toBe(expected.providerSubscriptionId);
    }
  } catch (error) {
    await maybeDump(options?.context);
    throw error;
  }
}

export type ExpectBillingSnapshotOptions = {
  compareTopLevel?: { isPremium?: boolean; slotsLimit?: number };
  context?: E2eTestContext;
};

export async function expectBillingSnapshot(
  snapshot: BillingSnapshot,
  expected: Partial<BillingSnapshot>,
  options?: ExpectBillingSnapshotOptions
): Promise<void> {
  try {
    for (const [key, value] of Object.entries(expected) as [keyof BillingSnapshot, unknown][]) {
      expect(snapshot[key]).toEqual(value);
    }

    if (options?.compareTopLevel?.isPremium !== undefined) {
      expect(snapshot.hasPremiumAccess).toBe(options.compareTopLevel.isPremium);
    }
    if (options?.compareTopLevel?.slotsLimit !== undefined) {
      expect(snapshot.slotsLimit).toBe(options.compareTopLevel.slotsLimit);
    }
  } catch (error) {
    await maybeDump(options?.context);
    throw error;
  }
}

export type ExpectInvariantSetOptions = {
  allowKnownGaps?: string[];
  context?: E2eTestContext;
  now?: Date;
};

export async function expectInvariantSet(
  subscription: Subscription,
  expected: { violations: string[] },
  options?: ExpectInvariantSetOptions
): Promise<void> {
  const now = options?.now ?? new Date();
  const snapshot: SubscriptionInvariantSnapshot = mapToInvariantSnapshot(subscription);
  const actual = getSubscriptionInvariantViolations(snapshot, now);
  const allowed = new Set([...expected.violations, ...(options?.allowKnownGaps ?? [])]);

  try {
    for (const violation of actual) {
      expect(allowed.has(violation)).toBe(true);
    }

    for (const required of expected.violations) {
      if (required !== '') {
        expect(actual).toContain(required);
      }
    }

    const unexpected = actual.filter((v) => !allowed.has(v));
    expect(unexpected).toEqual([]);
  } catch (error) {
    await maybeDump(options?.context);
    throw error;
  }
}

/** Build snapshot from subscription row for UI-tier tests. */
export function buildSnapshotFromSubscription(
  subscription: Subscription | null,
  now?: Date
): BillingSnapshot {
  return buildBillingSnapshot(subscription, { now });
}
