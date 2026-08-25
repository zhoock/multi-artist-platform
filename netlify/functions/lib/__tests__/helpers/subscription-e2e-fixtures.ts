/**
 * PR-10 shared fixture IDs and template builders (no DB).
 * @see docs/adr/pr-10-e2e-specification.md §4
 */

import type { SubscriptionPlanSlug } from '../../subscription-billing';
import type { SubscriptionStatus } from '../../subscriptions';

/** Fixed UUIDs for reproducible seeds. */
export const TEST_USER_SUBSCRIBER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const TEST_USER_ARTIST_A = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
export const TEST_USER_ARTIST_B = 'cccccccc-dddd-4eee-8fff-000000000000';
export const TEST_USER_ARTIST_C = 'dddddddd-eeee-4fff-8aaa-111111111111';

export type SeedSubscriptionParams = {
  userId?: string;
  status?: SubscriptionStatus;
  plan?: SubscriptionPlanSlug;
  slotsLimit?: number;
  expiresAt?: Date;
  startedAt?: Date;
  paymentMethodId?: string | null;
  paymentMethodTitle?: string | null;
  nextChargeAt?: Date | null;
  scheduledPlan?: string | null;
  renewalAttemptCount?: number;
  firstFailedAt?: Date | null;
  providerSubscriptionId?: string | null;
  billingOrigin?: 'production' | 'dev';
};

export type SeedArchiveArtistParams = {
  artistUserId: string;
  isActive?: boolean;
  lockedUntil?: Date | null;
};

export type E2eTestContext = {
  scenarioId: string;
  userId: string;
  flagAutoRenew: boolean;
  frozenNow?: Date;
};

export function createE2eContext(
  scenarioId: string,
  overrides: Partial<E2eTestContext> = {}
): E2eTestContext {
  return {
    scenarioId,
    userId: TEST_USER_SUBSCRIBER,
    flagAutoRenew: process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true',
    ...overrides,
  };
}

/** In-memory defaults matching production catalog (explorer). */
export function defaultSeedSubscriptionParams(
  overrides: SeedSubscriptionParams = {}
): Required<
  Pick<SeedSubscriptionParams, 'userId' | 'status' | 'plan' | 'slotsLimit' | 'expiresAt'>
> &
  SeedSubscriptionParams {
  const expiresAt = overrides.expiresAt ?? new Date('2026-09-03T00:00:00.000Z');
  return {
    userId: TEST_USER_SUBSCRIBER,
    status: 'active',
    plan: 'explorer',
    slotsLimit: 20,
    expiresAt,
    startedAt: overrides.startedAt ?? new Date('2026-08-05T12:00:00.000Z'),
    paymentMethodId: null,
    paymentMethodTitle: null,
    nextChargeAt: null,
    scheduledPlan: null,
    renewalAttemptCount: 0,
    firstFailedAt: null,
    providerSubscriptionId: null,
    billingOrigin: 'dev',
    ...overrides,
  };
}
