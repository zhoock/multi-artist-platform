/**
 * Group B — Resubscribe (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { hasPremiumAccess } from '../../../subscription-access';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processSubscriptionProviderPaymentForRow } from '../../../subscription-payment-router';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  buildSnapshotFromSubscription,
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
    id: 'B-BOTH-001',
    title: 'resubscribe without saved payment method',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-BOTH-002',
    title: 'resubscribe from canceled',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-ON-003',
    title: 'resubscribe with existing PM (I2 gap)',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
    knownGaps: ['I2'],
  },
  {
    id: 'B-ON-004',
    title: 'I2 remediation via backfill 069',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-ON-005',
    title: 'I2 remediation via enable auto-renew',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-ON-006',
    title: 'rebind alone does not restore next_charge_at',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
    knownGaps: ['I2'],
  },
  {
    id: 'B-ON-007',
    title: 'resubscribe from past_due',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-ON-008',
    title: 'resubscribe from cancel_at_period_end',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'B-BOTH-009',
    title: 'entitlement after resubscribe',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['B-BOTH-001', 'B-BOTH-009']);
const dbTest = isE2eDatabaseConfigured() ? test : test.skip;

function invariantOpts(ctx: ReturnType<typeof createE2eContext>) {
  return {
    context: ctx,
    now: ctx.frozenNow,
    allowKnownGaps: ctx.flagAutoRenew ? [] : ['I2'],
  };
}

async function fulfillDevInitial(userId: string) {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    userId,
    'explorer',
    'initial'
  );
  const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
  const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  if (!row) throw new Error('payment row missing');
  const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
    devMode: true,
  });
  if (!providerPayment) throw new Error('provider payment missing');
  return processSubscriptionProviderPaymentForRow(providerPayment, userId, row.kind, {
    devMode: true,
  });
}

describe('Group B — Resubscribe @tier1', () => {
  dbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('B-BOTH-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'expired',
        plan: 'explorer',
        slotsLimit: 20,
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        paymentMethodId: null,
        nextChargeAt: null,
      });

      const result = await fulfillDevInitial(ctx.userId);
      expect(result.subscriptionActivated).toBe(true);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'explorer',
        },
        { context: ctx }
      );

      if (ctx.flagAutoRenew) {
        expect(subscription?.paymentMethodId?.startsWith('dev-pm-')).toBe(true);
      } else {
        await expectSubscriptionState(subscription, { paymentMethodId: null }, { context: ctx });
      }

      if (subscription) {
        await expectInvariantSet(subscription, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  dbTest(buildTaggedTestName(SCENARIOS[8]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('B-BOTH-009', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'expired',
        plan: 'explorer',
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      });

      expect(hasPremiumAccess(await loadSubscriptionForUser(ctx.userId), E2E_TIME_ANCHOR)).toBe(
        false
      );

      await fulfillDevInitial(ctx.userId);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);
      await expectBillingSnapshot(snapshot, {
        hasPremiumAccess: true,
        status: 'active',
      });

      if (subscription) {
        await expectInvariantSet(subscription, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
