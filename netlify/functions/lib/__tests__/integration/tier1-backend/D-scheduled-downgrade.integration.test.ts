/**
 * Group D — Scheduled downgrade (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { query } from '../../../db';
import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processSubscriptionProviderPaymentForRow } from '../../../subscription-payment-router';
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
import {
  loadSubscriptionForUser,
  seedArchiveArtists,
  seedSubscription,
  seedTestUser,
} from '../../helpers/subscription-e2e-seed';
import { buildBillingSnapshot } from '../../../subscription-billing-snapshot';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'D-ON-001',
    title: 'create scheduled downgrade',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-002',
    title: 'replace scheduled downgrade',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-003',
    title: 'cancel scheduled downgrade',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-004',
    title: 'renewal applies scheduled downgrade',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-005',
    title: 'excess artists deactivation on downgrade',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-006',
    title: 'schedule blocked when past_due',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-ON-007',
    title: 'scheduled plan survives auto-renew disable',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'D-OFF-008',
    title: 'schedule endpoint 503 when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['D-ON-004', 'D-ON-005']);
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

async function fulfillDevRenewal(userId: string) {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    userId,
    'explorer',
    'renewal'
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

describe('Group D — Scheduled downgrade @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[3]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('D-ON-004', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'collector',
        slotsLimit: 60,
        expiresAt: new Date('2026-08-05T00:00:00.000Z'),
        paymentMethodId: 'pm-d-renewal',
        nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
        scheduledPlan: 'explorer',
      });

      await fulfillDevRenewal(ctx.userId);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          plan: 'explorer',
          slotsLimit: 20,
          scheduledPlan: null,
        },
        { context: ctx }
      );

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      await expectBillingSnapshot(snapshot, {
        plan: 'explorer',
        slotsLimit: 20,
        scheduledPlan: null,
      });

      if (subscription) {
        await expectInvariantSet(
          subscription,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }

      void sub;
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(
    buildTaggedTestName(SCENARIOS[4]!),
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('D-ON-005', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);

        const periodEnd = new Date('2026-08-05T00:00:00.000Z');
        await seedSubscription({
          userId: ctx.userId,
          status: 'active',
          plan: 'collector',
          slotsLimit: 60,
          expiresAt: periodEnd,
          paymentMethodId: 'pm-d-excess',
          nextChargeAt: periodEnd,
          scheduledPlan: 'explorer',
        });

        const artistIds: string[] = [];
        for (let i = 0; i < 22; i += 1) {
          const artistId = `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`;
          artistIds.push(artistId);
          await seedTestUser(artistId, `artist-${i}@pr10-e2e.test`);
        }

        await seedArchiveArtists(
          ctx.userId,
          artistIds.map((artistUserId) => ({
            artistUserId,
            isActive: true,
            lockedUntil: periodEnd,
          }))
        );

        await fulfillDevRenewal(ctx.userId);

        const activeCount = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
         FROM user_archive
         WHERE user_id = $1::uuid AND is_active = true`,
          [ctx.userId]
        );

        expect(Number(activeCount.rows[0]?.count ?? 0)).toBeLessThanOrEqual(20);

        const subscription = await loadSubscriptionForUser(ctx.userId);
        await expectSubscriptionState(
          subscription,
          { plan: 'explorer', slotsLimit: 20 },
          { context: ctx }
        );

        if (subscription) {
          await expectInvariantSet(
            subscription,
            { violations: [] },
            { context: ctx, now: E2E_TIME_ANCHOR }
          );
        }
      }, E2E_TIME_ANCHOR);
    },
    30_000
  );

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
