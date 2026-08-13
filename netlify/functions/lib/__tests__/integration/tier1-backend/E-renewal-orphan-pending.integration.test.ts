/**
 * Group E — Orphan pending renewal deadlock + stale next_charge_at (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { computeSupportExpiresAt, fulfillSubscriptionPayment } from '../../../subscription-billing';
import { buildBillingSnapshot } from '../../../subscription-billing-snapshot';
import { query } from '../../../db';
import {
  listChargeReadySubscriptionIds,
  runRenewalCycle,
} from '../../../subscription-renewal-engine';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import { createE2eContext, TEST_USER_ARTIST_A } from '../../helpers/subscription-e2e-fixtures';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import {
  loadSubscriptionForUser,
  loadSubscriptionPaymentsForUser,
  seedSubscription,
} from '../../helpers/subscription-e2e-seed';
import { resolveRenewalCountdownDisplay } from '../../../../../../src/shared/lib/subscription/renewalCountdown';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'E-ON-015',
    title: 'orphan pending renewal unblocks scheduler renewal cycle',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-016',
    title: 'active initial checkout syncs stale next_charge_at to expires_at',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'E-ON-017',
    title: 'fulfillSubscriptionPayment UPDATE casts $7 so PostgreSQL type deduction succeeds',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
];

const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

async function fulfillSubscriptionPaymentRejectingParam7TypeError(
  params: Parameters<typeof fulfillSubscriptionPayment>[0]
): Promise<Awaited<ReturnType<typeof fulfillSubscriptionPayment>>> {
  try {
    return await fulfillSubscriptionPayment(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(message).not.toMatch(/inconsistent types deduced for parameter \$7/i);
    throw error;
  }
}

async function seedOrphanPendingRenewal(userId: string): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO subscription_payments (user_id, provider, status, amount, currency, plan, kind)
     VALUES ($1::uuid, 'yookassa', 'pending', 1, 'RUB', 'explorer', 'renewal')
     RETURNING id`,
    [userId]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Failed to seed orphan pending renewal');
  return id;
}

describe('Group E — orphan pending & next_charge_at @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-015', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const periodEnd = new Date('2026-08-05T00:00:00.000Z');
      const sub = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: periodEnd,
        paymentMethodId: 'pm-e-orphan-pending',
        nextChargeAt: periodEnd,
      });

      const orphanId = await seedOrphanPendingRenewal(ctx.userId);

      const chargeReadyBefore = await listChargeReadySubscriptionIds(E2E_TIME_ANCHOR);
      expect(chargeReadyBefore).not.toContain(sub.id);

      const cycle = await runRenewalCycle(E2E_TIME_ANCHOR);
      expect(cycle.chargesAttempted).toBeGreaterThanOrEqual(1);
      expect(cycle.errors).toBe(0);

      const payments = await loadSubscriptionPaymentsForUser(ctx.userId, 20);
      const orphan = payments.find((row) => row.id === orphanId);
      expect(orphan?.status).toBe('canceled');

      const renewalSucceeded = payments.filter(
        (row) => row.kind === 'renewal' && row.status === 'succeeded' && row.id !== orphanId
      );
      expect(renewalSucceeded.length).toBeGreaterThanOrEqual(1);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.status).toBe('active');
      expect(subscription?.expiresAt.getTime()).toBeGreaterThan(E2E_TIME_ANCHOR.getTime());
      expect(subscription?.nextChargeAt?.getTime()).toBe(subscription?.expiresAt.getTime());

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      const countdown = resolveRenewalCountdownDisplay({
        nextChargeAt: snapshot.nextChargeAt,
        expiresAt: snapshot.expiresAt,
        lang: 'ru',
        now: E2E_TIME_ANCHOR,
      });
      expect(countdown.isOverdue).toBe(false);
      expect(countdown.label).not.toMatch(/ожидается подтверждение/i);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[1]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-016', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const staleNextCharge = new Date('2026-08-01T00:00:00.000Z');
      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-08-04T00:00:00.000Z'),
        paymentMethodId: 'pm-e-stale-next-charge',
        nextChargeAt: staleNextCharge,
        providerSubscriptionId: 'initial-provider-payment',
      });

      const updated = await fulfillSubscriptionPayment({
        userId: ctx.userId,
        planSlug: 'explorer',
        providerPaymentId: 'pay-active-extend',
      });

      const expectedExpires = computeSupportExpiresAt('explorer', E2E_TIME_ANCHOR);
      expect(updated.expiresAt?.getTime()).toBe(expectedExpires.getTime());

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.nextChargeAt?.getTime()).toBe(expectedExpires.getTime());
      expect(subscription?.nextChargeAt?.getTime()).not.toBe(staleNextCharge.getTime());

      const snapshot = buildBillingSnapshot(subscription, { now: E2E_TIME_ANCHOR });
      const countdown = resolveRenewalCountdownDisplay({
        nextChargeAt: snapshot.nextChargeAt,
        expiresAt: snapshot.expiresAt,
        lang: 'ru',
        now: E2E_TIME_ANCHOR,
      });
      expect(countdown.isOverdue).toBe(false);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[2]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('E-ON-017', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'expired',
        plan: 'explorer',
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        nextChargeAt: new Date('2026-07-01T00:00:00.000Z'),
        providerSubscriptionId: 'pay-expired-previous',
      });

      const resubscribed = await fulfillSubscriptionPaymentRejectingParam7TypeError({
        userId: ctx.userId,
        planSlug: 'explorer',
        providerPaymentId: 'pay-resubscribe-$7',
      });
      expect(resubscribed.status).toBe('active');
      const resubscribedRow = await loadSubscriptionForUser(ctx.userId);
      expect(resubscribedRow?.nextChargeAt).toBeNull();

      const staleNextCharge = new Date('2026-08-01T00:00:00.000Z');
      await seedSubscription({
        userId: TEST_USER_ARTIST_A,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-08-04T00:00:00.000Z'),
        nextChargeAt: staleNextCharge,
        providerSubscriptionId: 'pay-active-previous',
      });

      const extended = await fulfillSubscriptionPaymentRejectingParam7TypeError({
        userId: TEST_USER_ARTIST_A,
        planSlug: 'explorer',
        providerPaymentId: 'pay-active-extend-$7',
      });
      expect(extended.status).toBe('active');
      const extendedRow = await loadSubscriptionForUser(TEST_USER_ARTIST_A);
      expect(extendedRow?.nextChargeAt).not.toBeNull();
      expect(extendedRow?.nextChargeAt?.getTime()).toBe(extendedRow?.expiresAt.getTime());
      expect(extendedRow?.nextChargeAt?.getTime()).toBe(extended.expiresAt?.getTime());
      expect(extendedRow?.nextChargeAt?.getTime()).not.toBe(staleNextCharge.getTime());
    }, E2E_TIME_ANCHOR);
  });
});
