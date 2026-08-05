/**
 * Group E — Renewal (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import {
  attachProviderPaymentId,
  createPendingSubscriptionPayment,
} from '../../../subscription-billing';
import { buildBillingSnapshot } from '../../../subscription-billing-snapshot';
import { hasPremiumAccess } from '../../../subscription-access';
import type { SubscriptionProviderPayment } from '../../../subscription-provider-payment';
import {
  applySubscriptionPeriodEnded,
  handleRenewalPaymentFailure,
  processRenewalSubscriptionProviderPayment,
} from '../../../subscription-renewal-fulfillment';
import {
  attemptRenewalChargeForSubscription,
  runRenewalCycle,
} from '../../../subscription-renewal-engine';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  expectBillingSnapshot,
  expectInvariantSet,
  expectSubscriptionState,
} from '../../helpers/subscription-e2e-assertions';
import { createE2eContext } from '../../helpers/subscription-e2e-fixtures';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import { loadSubscriptionForUser, seedSubscription } from '../../helpers/subscription-e2e-seed';

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
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

const FIXED_RENEWAL_PAYMENT_ID = '11111111-1111-4111-8111-111111111111';

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

  flagOnDbTest(buildTaggedTestName(SCENARIOS[5]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-006', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'past_due',
        plan: 'explorer',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        paymentMethodId: 'pm-e-exhaust',
        renewalAttemptCount: 3,
        firstFailedAt: new Date('2026-07-28T00:00:00.000Z'),
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      const { handled, subscription } = await handleRenewalPaymentFailure({
        userId: ctx.userId,
        providerPaymentId: '22222222-2222-4222-8222-222222222222',
      });

      expect(handled).toBe(true);
      await expectSubscriptionState(
        subscription,
        {
          status: 'expired',
          renewalAttemptCount: 4,
          nextChargeAt: null,
        },
        { context: ctx }
      );

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(false);

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

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
