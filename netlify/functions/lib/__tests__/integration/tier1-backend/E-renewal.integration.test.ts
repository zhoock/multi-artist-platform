/**
 * Group E — Renewal (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import {
  attachProviderPaymentId,
  computeSupportExpiresAt,
  createPendingSubscriptionPayment,
} from '../../../subscription-billing';
import { buildBillingSnapshot } from '../../../subscription-billing-snapshot';
import { hasPremiumAccess } from '../../../subscription-access';
import type { SubscriptionProviderPayment } from '../../../subscription-provider-payment';
import {
  applySubscriptionPeriodEnded,
  processRenewalSubscriptionProviderPayment,
} from '../../../subscription-renewal-fulfillment';
import {
  attemptRenewalChargeForSubscription,
  claimSubscriptionForRenewalCharge,
  runRenewalCycle,
} from '../../../subscription-renewal-engine';
import { computeRenewalRetryChargeAt } from '../../../subscription-state';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  expectBillingSnapshot,
  expectInvariantSet,
  expectSubscriptionState,
} from '../../helpers/subscription-e2e-assertions';
import {
  createE2eContext,
  TEST_USER_ARTIST_A,
  TEST_USER_ARTIST_B,
} from '../../helpers/subscription-e2e-fixtures';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import {
  E2E_TIME_ANCHOR,
  E2E_TIME_OFFSETS,
  addMs,
  withFrozenTime,
} from '../../helpers/subscription-e2e-time';
import {
  loadSubscriptionForUser,
  loadSubscriptionPaymentsForUser,
  seedSubscription,
  seedTestUser,
} from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'E-ON-001',
    title: 'renewal success',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-002',
    title: 'renewal payment failure first attempt',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-003',
    title: 'retry success from past_due',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-004',
    title: 'grace period premium access',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-005',
    title: 'grace expired denies access',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-006',
    title: 'dunning exhausted to expired',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-007',
    title: 'scheduler restart idempotency',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-008',
    title: 'duplicate scheduler execution',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-009',
    title: 'period ended without charge',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-010',
    title: 'renewal applies scheduled_plan',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-OFF-011',
    title: 'scheduler no-op when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['E-ON-001', 'E-ON-002', 'E-ON-006', 'E-ON-009']);
const IMPLEMENTED_IDS = new Set([
  ...P0_IDS,
  'E-ON-003',
  'E-ON-004',
  'E-ON-005',
  'E-ON-007',
  'E-ON-008',
  'E-ON-010',
]);

const RENEWAL_CLAIM_LOCK_MS = 30 * 60 * 1000;
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

const FIXED_RENEWAL_PAYMENT_ID = '11111111-1111-4111-8111-111111111111';

const DUNNING_FAILURE_PAYMENT_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const;

async function simulateCanceledRenewalPayment(
  userId: string,
  providerPaymentId: string,
  paymentMethodId: string
): Promise<void> {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    userId,
    'explorer',
    'renewal'
  );
  await attachProviderPaymentId(subscriptionPaymentId, providerPaymentId);

  const canceledPayment: SubscriptionProviderPayment = {
    id: providerPaymentId,
    status: 'canceled',
    amount: { value: '1.00', currency: 'RUB' },
    metadata: {
      productType: 'premium_subscription',
      userId,
      plan: 'explorer',
      kind: 'renewal',
    },
    paymentMethod: { id: paymentMethodId, saved: true, title: null },
  };

  await processRenewalSubscriptionProviderPayment(canceledPayment, userId);
}

describe('Group E — Renewal @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-08-05T00:00:00.000Z'),
        paymentMethodId: 'pm-e-renewal',
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      const outcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(outcome).toBe('attempted');

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          renewalAttemptCount: 0,
        },
        { context: ctx }
      );

      expect(subscription?.expiresAt.getTime()).toBeGreaterThan(E2E_TIME_ANCHOR.getTime());
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, { hasPremiumAccess: true, status: 'active' });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[1]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-002', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: 'pm-e-fail',
        nextChargeAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'renewal'
      );
      await attachProviderPaymentId(subscriptionPaymentId, FIXED_RENEWAL_PAYMENT_ID);

      const canceledPayment: SubscriptionProviderPayment = {
        id: FIXED_RENEWAL_PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: ctx.userId,
          plan: 'explorer',
          kind: 'renewal',
        },
        paymentMethod: { id: 'pm-e-fail', saved: true, title: null },
      };

      await processRenewalSubscriptionProviderPayment(canceledPayment, ctx.userId);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'past_due',
          renewalAttemptCount: 1,
        },
        { context: ctx }
      );

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'past_due',
        hasPremiumAccess: true,
        renewalAttemptCount: 1,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[2]!), async () => {
    await withFrozenTime(async (time) => {
      const ctx = createE2eContext('E-ON-003', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-retry';
      const initialExpiresAt = new Date('2026-09-03T00:00:00.000Z');
      const initialNextChargeAt = new Date('2026-08-05T00:00:00.000Z');

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: initialExpiresAt,
        paymentMethodId,
        nextChargeAt: initialNextChargeAt,
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'renewal'
      );
      await attachProviderPaymentId(subscriptionPaymentId, FIXED_RENEWAL_PAYMENT_ID);

      const canceledPayment: SubscriptionProviderPayment = {
        id: FIXED_RENEWAL_PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: ctx.userId,
          plan: 'explorer',
          kind: 'renewal',
        },
        paymentMethod: { id: paymentMethodId, saved: true, title: null },
      };

      await processRenewalSubscriptionProviderPayment(canceledPayment, ctx.userId);

      let subscription = await loadSubscriptionForUser(ctx.userId);
      if (!subscription?.firstFailedAt) {
        throw new Error('first_failed_at missing after renewal cancel');
      }
      const firstFailedAt =
        subscription.firstFailedAt instanceof Date
          ? subscription.firstFailedAt
          : new Date(subscription.firstFailedAt);
      const expectedRetryAt = computeRenewalRetryChargeAt(firstFailedAt, 1);
      if (!expectedRetryAt) throw new Error('expected retry charge time missing');

      await expectSubscriptionState(
        subscription,
        {
          status: 'past_due',
          renewalAttemptCount: 1,
          firstFailedAt,
          nextChargeAt: expectedRetryAt,
          paymentMethodId,
        },
        { context: ctx }
      );

      expect(expectedRetryAt.getTime()).toBe(
        firstFailedAt.getTime() + E2E_TIME_OFFSETS.renewalRetry1
      );
      expect(subscription?.expiresAt.getTime()).toBe(initialExpiresAt.getTime());
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      time.set(expectedRetryAt);

      const outcome = await attemptRenewalChargeForSubscription(sub.id, time.now());
      expect(outcome).toBe('attempted');

      const expectedExpiresAt = computeSupportExpiresAt('explorer', expectedRetryAt);
      subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          renewalAttemptCount: 0,
          firstFailedAt: null,
          nextChargeAt: expectedExpiresAt,
          paymentMethodId,
        },
        { context: ctx }
      );

      expect(subscription?.expiresAt.getTime()).toBe(expectedExpiresAt.getTime());
      expect(subscription?.expiresAt.getTime()).toBeGreaterThan(expectedRetryAt.getTime());
      expect(hasPremiumAccess(subscription, expectedRetryAt)).toBe(true);

      const snapshot = buildBillingSnapshot(subscription, { now: expectedRetryAt });
      await expectBillingSnapshot(snapshot, {
        status: 'active',
        hasPremiumAccess: true,
        renewalAttemptCount: 0,
        hasSavedPaymentMethod: true,
        autoRenewEnabled: true,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: expectedRetryAt }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[3]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-004', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-grace';
      const expiredPeriodEnd = new Date('2026-08-01T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: expiredPeriodEnd,
        paymentMethodId,
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'renewal'
      );
      await attachProviderPaymentId(subscriptionPaymentId, FIXED_RENEWAL_PAYMENT_ID);

      const canceledPayment: SubscriptionProviderPayment = {
        id: FIXED_RENEWAL_PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: ctx.userId,
          plan: 'explorer',
          kind: 'renewal',
        },
        paymentMethod: { id: paymentMethodId, saved: true, title: null },
      };

      await processRenewalSubscriptionProviderPayment(canceledPayment, ctx.userId);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      if (!subscription?.firstFailedAt) {
        throw new Error('first_failed_at missing after renewal cancel');
      }
      const firstFailedAt =
        subscription.firstFailedAt instanceof Date
          ? subscription.firstFailedAt
          : new Date(subscription.firstFailedAt);
      const expectedRetryAt = computeRenewalRetryChargeAt(firstFailedAt, 1);
      if (!expectedRetryAt) throw new Error('expected retry charge time missing');

      await expectSubscriptionState(
        subscription,
        {
          status: 'past_due',
          renewalAttemptCount: 1,
          firstFailedAt,
          nextChargeAt: expectedRetryAt,
          paymentMethodId,
        },
        { context: ctx }
      );

      expect(subscription.status).not.toBe('expired');
      expect(subscription.expiresAt.getTime()).toBeLessThan(E2E_TIME_ANCHOR.getTime());
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const midGrace = addMs(firstFailedAt, 3 * 24 * 60 * 60 * 1000);
      expect(midGrace.getTime()).toBeLessThan(
        firstFailedAt.getTime() + E2E_TIME_OFFSETS.gracePeriod
      );
      expect(hasPremiumAccess(subscription, midGrace)).toBe(true);

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'past_due',
        hasPremiumAccess: true,
        renewalAttemptCount: 1,
        hasSavedPaymentMethod: true,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[4]!), async () => {
    await withFrozenTime(async (time) => {
      const ctx = createE2eContext('E-ON-005', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-grace-expired';
      const expiredPeriodEnd = new Date('2026-08-01T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: expiredPeriodEnd,
        paymentMethodId,
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'renewal'
      );
      await attachProviderPaymentId(subscriptionPaymentId, FIXED_RENEWAL_PAYMENT_ID);

      const canceledPayment: SubscriptionProviderPayment = {
        id: FIXED_RENEWAL_PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: ctx.userId,
          plan: 'explorer',
          kind: 'renewal',
        },
        paymentMethod: { id: paymentMethodId, saved: true, title: null },
      };

      await processRenewalSubscriptionProviderPayment(canceledPayment, ctx.userId);

      let subscription = await loadSubscriptionForUser(ctx.userId);
      if (!subscription?.firstFailedAt) {
        throw new Error('first_failed_at missing after renewal cancel');
      }
      const firstFailedAt =
        subscription.firstFailedAt instanceof Date
          ? subscription.firstFailedAt
          : new Date(subscription.firstFailedAt);
      const expectedRetryAt = computeRenewalRetryChargeAt(firstFailedAt, 1);
      if (!expectedRetryAt) throw new Error('expected retry charge time missing');

      const afterGrace = addMs(firstFailedAt, E2E_TIME_OFFSETS.gracePeriod);
      time.set(afterGrace);

      subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'past_due',
          renewalAttemptCount: 1,
          firstFailedAt,
          nextChargeAt: expectedRetryAt,
          paymentMethodId,
        },
        { context: ctx }
      );

      expect(subscription?.status).not.toBe('expired');
      expect(afterGrace.getTime()).toBeGreaterThanOrEqual(
        firstFailedAt.getTime() + E2E_TIME_OFFSETS.gracePeriod
      );
      expect(hasPremiumAccess(subscription, afterGrace)).toBe(false);

      const snapshot = buildBillingSnapshot(subscription, { now: afterGrace });
      await expectBillingSnapshot(snapshot, {
        status: 'past_due',
        hasPremiumAccess: false,
        renewalAttemptCount: 1,
        hasSavedPaymentMethod: true,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: afterGrace }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[5]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-006', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-exhaust';
      const initialExpiresAt = new Date('2026-08-01T00:00:00.000Z');

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        scheduledPlan: 'collector',
        expiresAt: initialExpiresAt,
        paymentMethodId,
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      for (let attempt = 0; attempt < DUNNING_FAILURE_PAYMENT_IDS.length; attempt += 1) {
        await simulateCanceledRenewalPayment(
          ctx.userId,
          DUNNING_FAILURE_PAYMENT_IDS[attempt]!,
          paymentMethodId
        );

        const subscription = await loadSubscriptionForUser(ctx.userId);
        const expectedCount = attempt + 1;

        if (expectedCount < DUNNING_FAILURE_PAYMENT_IDS.length) {
          await expectSubscriptionState(
            subscription,
            {
              status: 'past_due',
              renewalAttemptCount: expectedCount,
              paymentMethodId,
            },
            { context: ctx }
          );
          expect(subscription?.firstFailedAt).not.toBeNull();
          expect(subscription?.nextChargeAt).not.toBeNull();
        }
      }

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'expired',
          renewalAttemptCount: 4,
          nextChargeAt: null,
          scheduledPlan: null,
          paymentMethodId,
        },
        { context: ctx }
      );

      expect(subscription?.expiresAt.getTime()).toBe(initialExpiresAt.getTime());
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(false);

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'expired',
        hasPremiumAccess: false,
        renewalAttemptCount: 4,
        hasSavedPaymentMethod: true,
      });

      const chargeOutcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(chargeOutcome).toBe('skipped');

      const payments = await loadSubscriptionPaymentsForUser(ctx.userId, 20);
      expect(payments.filter((row) => row.kind === 'renewal')).toHaveLength(4);
      expect(
        payments.filter(
          (row) =>
            row.kind === 'renewal' &&
            (row.status === 'pending' || row.status === 'waiting_for_capture')
        )
      ).toHaveLength(0);
      expect(payments.every((row) => row.status === 'canceled')).toBe(true);

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR, allowKnownGaps: ['I6'] }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[6]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-007', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-restart';
      const chargeReadyAt = new Date('2026-08-05T00:00:00.000Z');

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: chargeReadyAt,
        paymentMethodId,
        nextChargeAt: chargeReadyAt,
      });

      const firstOutcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(firstOutcome).toBe('attempted');

      let subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.paymentMethodId).toBe(paymentMethodId);

      let renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
        (row) => row.kind === 'renewal'
      );
      expect(renewalPayments).toHaveLength(1);
      expect(['pending', 'succeeded']).toContain(renewalPayments[0]?.status);

      const secondOutcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(secondOutcome).toBe('skipped');

      renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
        (row) => row.kind === 'renewal'
      );
      expect(renewalPayments).toHaveLength(1);
      expect(renewalPayments[0]?.status).toBe('succeeded');

      const thirdOutcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(thirdOutcome).toBe('skipped');

      renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
        (row) => row.kind === 'renewal'
      );
      expect(renewalPayments).toHaveLength(1);

      await seedTestUser(TEST_USER_ARTIST_A, 'artist-a@pr10-e2e.test');
      const pendingGuardSub = await seedSubscription({
        userId: TEST_USER_ARTIST_A,
        status: 'active',
        plan: 'explorer',
        expiresAt: chargeReadyAt,
        paymentMethodId: 'pm-e-pending-guard',
        nextChargeAt: chargeReadyAt,
      });

      await createPendingSubscriptionPayment(TEST_USER_ARTIST_A, 'explorer', 'renewal');

      const pendingGuardOutcome = await attemptRenewalChargeForSubscription(
        pendingGuardSub.id,
        E2E_TIME_ANCHOR
      );
      expect(pendingGuardOutcome).toBe('skipped');

      const pendingGuardPayments = (
        await loadSubscriptionPaymentsForUser(TEST_USER_ARTIST_A, 20)
      ).filter((row) => row.kind === 'renewal');
      expect(pendingGuardPayments).toHaveLength(1);
      expect(pendingGuardPayments[0]?.status).toBe('pending');

      await seedTestUser(TEST_USER_ARTIST_B, 'artist-b@pr10-e2e.test');
      const lockSub = await seedSubscription({
        userId: TEST_USER_ARTIST_B,
        status: 'active',
        plan: 'explorer',
        expiresAt: chargeReadyAt,
        paymentMethodId: 'pm-e-lock',
        nextChargeAt: chargeReadyAt,
      });

      const claim = await claimSubscriptionForRenewalCharge(lockSub.id, E2E_TIME_ANCHOR);
      expect(claim).not.toBeNull();

      const lockedSubscription = await loadSubscriptionForUser(TEST_USER_ARTIST_B);
      const expectedLockUntil = addMs(E2E_TIME_ANCHOR, RENEWAL_CLAIM_LOCK_MS);
      expect(lockedSubscription?.nextChargeAt?.getTime()).toBe(expectedLockUntil.getTime());

      const lockRestartOutcome = await attemptRenewalChargeForSubscription(
        lockSub.id,
        E2E_TIME_ANCHOR
      );
      expect(lockRestartOutcome).toBe('skipped');
      expect(
        (await loadSubscriptionPaymentsForUser(TEST_USER_ARTIST_B, 20)).filter(
          (row) => row.kind === 'renewal'
        )
      ).toHaveLength(0);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[7]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-008', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-concurrent';
      const chargeReadyAt = new Date('2026-08-05T00:00:00.000Z');

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: chargeReadyAt,
        paymentMethodId,
        nextChargeAt: chargeReadyAt,
      });

      const [concurrentA, concurrentB] = await Promise.all([
        attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR),
        attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR),
      ]);

      expect([concurrentA, concurrentB].sort()).toEqual(['attempted', 'skipped']);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.paymentMethodId).toBe(paymentMethodId);

      const renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
        (row) => row.kind === 'renewal'
      );
      expect(renewalPayments).toHaveLength(1);
      expect(renewalPayments[0]?.status).toBe('succeeded');

      const providerPaymentIds = renewalPayments
        .map((row) => row.provider_payment_id)
        .filter((id): id is string => Boolean(id?.trim()));
      expect(providerPaymentIds).toHaveLength(1);
      expect(new Set(providerPaymentIds).size).toBe(1);

      const afterRenewalOutcome = await attemptRenewalChargeForSubscription(
        sub.id,
        E2E_TIME_ANCHOR
      );
      expect(afterRenewalOutcome).toBe('skipped');
      expect(
        (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
          (row) => row.kind === 'renewal'
        )
      ).toHaveLength(1);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[8]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-009', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'cancel_at_period_end',
        plan: 'explorer',
        expiresAt: new Date('2026-08-05T00:00:00.000Z'),
        paymentMethodId: 'pm-e-period',
        nextChargeAt: null,
      });

      const cycle = await runRenewalCycle(E2E_TIME_ANCHOR);
      expect(cycle.periodsEnded).toBeGreaterThanOrEqual(1);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'expired',
        },
        { context: ctx }
      );

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(false);

      const ended = await applySubscriptionPeriodEnded(sub.id, ctx.userId);
      expect(ended?.status).toBe('expired');

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'expired',
        hasPremiumAccess: false,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[9]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-010', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const paymentMethodId = 'pm-e-scheduled-plan';
      const chargeReadyAt = new Date('2026-08-05T00:00:00.000Z');

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        scheduledPlan: 'collector',
        expiresAt: chargeReadyAt,
        paymentMethodId,
        nextChargeAt: chargeReadyAt,
      });

      let subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'explorer',
          scheduledPlan: 'collector',
          paymentMethodId,
        },
        { context: ctx }
      );

      const outcome = await attemptRenewalChargeForSubscription(sub.id, E2E_TIME_ANCHOR);
      expect(outcome).toBe('attempted');

      const expectedExpiresAt = computeSupportExpiresAt('collector', E2E_TIME_ANCHOR);
      subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'collector',
          slotsLimit: 60,
          scheduledPlan: null,
          renewalAttemptCount: 0,
          firstFailedAt: null,
          paymentMethodId,
          nextChargeAt: expectedExpiresAt,
          expiresAt: expectedExpiresAt,
        },
        { context: ctx }
      );

      if (!subscription?.providerSubscriptionId) {
        throw new Error('provider_subscription_id missing after renewal');
      }

      const replayPayment: SubscriptionProviderPayment = {
        id: subscription.providerSubscriptionId,
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: ctx.userId,
          plan: 'collector',
          kind: 'renewal',
        },
        paymentMethod: { id: paymentMethodId, saved: true, title: null },
      };

      const firstReplay = await processRenewalSubscriptionProviderPayment(
        replayPayment,
        ctx.userId
      );
      const secondReplay = await processRenewalSubscriptionProviderPayment(
        replayPayment,
        ctx.userId
      );

      expect(firstReplay.alreadyFulfilled).toBe(true);
      expect(secondReplay.alreadyFulfilled).toBe(true);

      const afterReplay = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        afterReplay,
        {
          status: 'active',
          plan: 'collector',
          slotsLimit: 60,
          scheduledPlan: null,
          renewalAttemptCount: 0,
          paymentMethodId,
          nextChargeAt: expectedExpiresAt,
          expiresAt: expectedExpiresAt,
          providerSubscriptionId: subscription.providerSubscriptionId,
        },
        { context: ctx }
      );

      const snapshot = buildBillingSnapshot(afterReplay, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'active',
        plan: 'collector',
        hasPremiumAccess: true,
        hasSavedPaymentMethod: true,
        autoRenewEnabled: true,
      });
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !IMPLEMENTED_IDS.has(s.id)));
});
