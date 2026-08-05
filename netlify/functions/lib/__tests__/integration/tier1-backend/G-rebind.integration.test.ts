/**
 * Group G — Rebind (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processRebindSubscriptionProviderPaymentWithArchive } from '../../../subscription-rebind-fulfillment';
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
    id: 'G-ON-001',
    title: 'successful rebind',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-ON-002',
    title: 'cancelled rebind',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-ON-003',
    title: 'duplicate rebind callback',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-ON-004',
    title: 'rebind while renewal pending (M-1)',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-ON-005',
    title: 'rebind from past_due',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-ON-006',
    title: 'preserve payment_method_title when mask unavailable',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'G-OFF-007',
    title: 'rebind 503 when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['G-ON-001']);
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

describe('Group G — Rebind @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('G-ON-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'past_due',
        plan: 'explorer',
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: 'pm-g-old',
        paymentMethodTitle: 'Card •••• 4242',
        renewalAttemptCount: 1,
        firstFailedAt: new Date('2026-08-04T00:00:00.000Z'),
      });

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'rebind'
      );
      const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
      const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
      if (!row) throw new Error('payment row missing');

      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
        devMode: true,
      });
      if (!providerPayment) throw new Error('provider payment missing');

      const { paymentMethodUpdated, archive } =
        await processRebindSubscriptionProviderPaymentWithArchive(providerPayment, ctx.userId, {
          devMode: true,
        });

      expect(paymentMethodUpdated).toBe(true);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.paymentMethodId?.startsWith('dev-pm-')).toBe(true);
      expect(subscription?.paymentMethodTitle).toBeTruthy();

      await expectSubscriptionState(
        subscription,
        {
          status: 'past_due',
        },
        { context: ctx }
      );

      if (archive) {
        await expectBillingSnapshot(archive.billing, {
          paymentMethodTitle: subscription?.paymentMethodTitle ?? null,
        });
        expect(archive.isPremium).toBe(true);
      }

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
