/**
 * Group C — Upgrade (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
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
    id: 'C-ON-001',
    title: 'upgrade from active',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-ON-002',
    title: 'upgrade from cancel_at_period_end',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-ON-003',
    title: 'upgrade from past_due in grace',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-ON-004',
    title: 'duplicate upgrade checkout',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-ON-005',
    title: 'webhook replay upgrade',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-OFF-006',
    title: 'flag OFF upgrade as initial checkout',
    priority: 'P2',
    flags: ['off'],
    tier: 'tier1-backend',
  },
  {
    id: 'C-ON-007',
    title: 'archive not deactivated on upgrade',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['C-ON-001']);
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

describe('Group C — Upgrade @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('C-ON-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        slotsLimit: 20,
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: 'pm-upgrade-existing',
        nextChargeAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'collector',
        'upgrade'
      );
      const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
      const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
      if (!row) throw new Error('payment row missing');

      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
        devMode: true,
      });
      if (!providerPayment) throw new Error('provider payment missing');

      const result = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );
      expect(result.subscriptionActivated).toBe(true);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'collector',
          slotsLimit: 60,
        },
        { context: ctx }
      );

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);

      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);
      await expectBillingSnapshot(snapshot, {
        plan: 'collector',
        slotsLimit: 60,
        hasPremiumAccess: true,
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
