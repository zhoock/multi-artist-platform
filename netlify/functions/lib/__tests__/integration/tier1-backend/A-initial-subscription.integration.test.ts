/**
 * Group A — Initial subscription (tier1-backend)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group A
 */

import { describe, expect, test } from '@jest/globals';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
  type SubscriptionPlanSlug,
} from '../../../subscription-billing';
import { buildBillingSnapshot } from '../../../subscription-billing-snapshot';
import { hasPremiumAccess } from '../../../subscription-access';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processSubscriptionProviderPaymentForRow } from '../../../subscription-payment-router';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  buildSnapshotFromSubscription,
  expectBillingSnapshot,
  expectInvariantSet,
  expectSubscriptionState,
} from '../../helpers/subscription-e2e-assertions';
import { createE2eContext, TEST_USER_SUBSCRIBER } from '../../helpers/subscription-e2e-fixtures';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import { loadSubscriptionForUser } from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'A-BOTH-001',
    title: 'first purchase (no subscription row)',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-BOTH-002',
    title: 'duplicate webhook',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-BOTH-003',
    title: 'webhook + polling race',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-BOTH-004',
    title: 'refresh after checkout',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-ON-005',
    title: 'PM persist on first checkout',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-OFF-006',
    title: 'PM not persisted when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-ON-007',
    title: 'duplicate checkout blocked',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'A-ON-008',
    title: 'webhook replay after terminal',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['A-BOTH-001', 'A-BOTH-004']);
const dbTest = isE2eDatabaseConfigured() ? test : test.skip;

function invariantOpts(ctx: ReturnType<typeof createE2eContext>) {
  return {
    context: ctx,
    now: ctx.frozenNow,
    allowKnownGaps: ctx.flagAutoRenew ? [] : ['I2'],
  };
}

async function runDevInitialCheckout(userId: string, plan: SubscriptionPlanSlug = 'explorer') {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(userId, plan, 'initial');
  const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
  const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  if (!row?.provider_payment_id) {
    throw new Error('Expected provider_payment_id on pending row');
  }
  const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
    devMode: true,
  });
  if (!providerPayment) {
    throw new Error('Failed to map dev provider payment');
  }
  return processSubscriptionProviderPaymentForRow(providerPayment, userId, row.kind, {
    devMode: true,
  });
}

describe('Group A — Initial subscription @tier1', () => {
  dbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('A-BOTH-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      expect(await loadSubscriptionForUser(ctx.userId)).toBeNull();

      const result = await runDevInitialCheckout(ctx.userId, 'explorer');
      expect(result.subscriptionActivated).toBe(true);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'explorer',
          slotsLimit: 20,
        },
        { context: ctx }
      );

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);
      await expectBillingSnapshot(snapshot, {
        status: 'active',
        hasPremiumAccess: true,
        plan: 'explorer',
      });

      if (subscription) {
        await expectInvariantSet(subscription, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  dbTest(buildTaggedTestName(SCENARIOS[3]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('A-BOTH-004', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'initial'
      );
      const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
      const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
      if (!row) throw new Error('payment row missing');

      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
        devMode: true,
      });
      if (!providerPayment) throw new Error('provider payment missing');

      const first = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );
      expect(first.subscriptionActivated).toBe(true);

      const refresh = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );
      expect(refresh.alreadyFulfilled).toBe(true);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        status: 'active',
        hasPremiumAccess: true,
      });

      if (subscription) {
        await expectInvariantSet(subscription, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
