/**
 * Stale rebind epoch guard — regression matrix (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { query } from '../../../db';
import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  attachProviderPaymentId,
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
  markSubscriptionRebindPaymentMethodEpoch,
  readPaymentMethodEpoch,
  readRebindOutcome,
  REBIND_OUTCOME_APPLIED,
  REBIND_OUTCOME_STALE_AFTER_UNLINK,
} from '../../../subscription-billing';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import {
  isStaleRebindByEpoch,
  processRebindSubscriptionProviderPayment,
} from '../../../subscription-rebind-fulfillment';
import { scheduleSubscriptionDowngrade } from '../../../subscription-plan-schedule';
import { unlinkSubscriptionPaymentMethod } from '../../../subscription-payment-method-unlink';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import { createE2eContext } from '../../helpers/subscription-e2e-fixtures';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import { loadSubscriptionForUser, seedSubscription } from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

async function createRebindCheckout(
  userId: string,
  options: { snapshotEpoch?: boolean; resumeAutoRenew?: boolean } = {}
) {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    userId,
    'explorer',
    'rebind'
  );
  if (options.snapshotEpoch !== false) {
    await markSubscriptionRebindPaymentMethodEpoch(subscriptionPaymentId, userId);
  }
  if (options.resumeAutoRenew) {
    await query(
      `UPDATE subscription_payments
       SET raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [subscriptionPaymentId, JSON.stringify({ resumeAutoRenew: true })]
    );
  }
  const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
  const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  if (!row?.provider_payment_id) throw new Error('provider payment missing');
  const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
    devMode: true,
  });
  if (!providerPayment) throw new Error('provider payment missing');
  return { providerPayment, subscriptionPaymentId, paymentRow: row };
}

describe('Stale rebind epoch guard @tier1', () => {
  flagOnDbTest('R-007 unlink → rebind → schedule downgrade → callback restores PM', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-007', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'collector',
        expiresAt,
        paymentMethodId: 'pm-r7',
        paymentMethodTitle: 'Visa •••• 1111',
        nextChargeAt: expiresAt,
      });

      await unlinkSubscriptionPaymentMethod(ctx.userId);
      const { providerPayment } = await createRebindCheckout(ctx.userId);
      await scheduleSubscriptionDowngrade(ctx.userId, 'explorer');

      const result = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      expect(result.paymentMethodUpdated).toBe(true);
      expect(result.staleAfterUnlink).toBe(false);

      const after = await loadSubscriptionForUser(ctx.userId);
      expect(after?.paymentMethodId?.startsWith('dev-pm-')).toBe(true);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('R-008 POST → unlink → callback is stale', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-008', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-r8',
        nextChargeAt: expiresAt,
      });

      const { providerPayment, subscriptionPaymentId } = await createRebindCheckout(ctx.userId);
      await unlinkSubscriptionPaymentMethod(ctx.userId);

      const result = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      expect(result.paymentMethodUpdated).toBe(false);
      expect(result.staleAfterUnlink).toBe(true);

      const paymentRow = await getSubscriptionPaymentByInternalId(
        subscriptionPaymentId,
        ctx.userId
      );
      expect(readRebindOutcome(paymentRow?.raw_last_event)).toBe(REBIND_OUTCOME_STALE_AFTER_UNLINK);

      const after = await loadSubscriptionForUser(ctx.userId);
      expect(after?.paymentMethodId).toBeNull();
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('R-009 unlink → POST → callback is fresh', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-009', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-r9',
        nextChargeAt: expiresAt,
      });

      await unlinkSubscriptionPaymentMethod(ctx.userId);
      const { providerPayment } = await createRebindCheckout(ctx.userId);

      const result = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      expect(result.paymentMethodUpdated).toBe(true);
      expect(result.staleAfterUnlink).toBe(false);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('R-010 idempotent second unlink does not bump epoch again', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-010', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-r10',
        nextChargeAt: expiresAt,
      });

      const first = await unlinkSubscriptionPaymentMethod(ctx.userId);
      expect(first.unlinked).toBe(true);
      const epochAfterFirst = (await loadSubscriptionForUser(ctx.userId))?.paymentMethodEpoch;

      const second = await unlinkSubscriptionPaymentMethod(ctx.userId);
      expect(second.unlinked).toBe(false);
      const epochAfterSecond = (await loadSubscriptionForUser(ctx.userId))?.paymentMethodEpoch;
      expect(epochAfterSecond).toBe(epochAfterFirst);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(
    'R-011 backfill payment without epoch is stale on unlinked subscription',
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('R-011', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);
        const expiresAt = new Date('2026-09-03T00:00:00.000Z');

        await seedSubscription({
          userId: ctx.userId,
          status: 'cancel_at_period_end',
          plan: 'explorer',
          expiresAt,
          paymentMethodId: null,
          nextChargeAt: null,
        });
        await query(`UPDATE subscriptions SET payment_method_epoch = 1 WHERE user_id = $1::uuid`, [
          ctx.userId,
        ]);

        const { providerPayment, paymentRow } = await createRebindCheckout(ctx.userId, {
          snapshotEpoch: false,
        });

        const sub = await loadSubscriptionForUser(ctx.userId);
        expect(isStaleRebindByEpoch(sub!, readPaymentMethodEpoch(paymentRow?.raw_last_event))).toBe(
          true
        );

        const result = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
          devMode: true,
        });
        expect(result.staleAfterUnlink).toBe(true);
        expect(result.paymentMethodUpdated).toBe(false);
      }, E2E_TIME_ANCHOR);
    }
  );

  flagOnDbTest('R-012 stale terminal outcome is cached on duplicate callback', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-012', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-r12',
        nextChargeAt: expiresAt,
      });

      const { providerPayment, subscriptionPaymentId } = await createRebindCheckout(ctx.userId);
      await unlinkSubscriptionPaymentMethod(ctx.userId);

      const first = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      const second = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });

      expect(first.staleAfterUnlink).toBe(true);
      expect(second.staleAfterUnlink).toBe(true);
      expect(second.paymentMethodUpdated).toBe(false);

      const paymentRow = await getSubscriptionPaymentByInternalId(
        subscriptionPaymentId,
        ctx.userId
      );
      expect(readRebindOutcome(paymentRow?.raw_last_event)).toBe(REBIND_OUTCOME_STALE_AFTER_UNLINK);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('R-013 fresh duplicate callback records applied outcome', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('R-013', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);
      const expiresAt = new Date('2026-09-03T00:00:00.000Z');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-r13',
        nextChargeAt: expiresAt,
      });

      await unlinkSubscriptionPaymentMethod(ctx.userId);
      const { providerPayment, subscriptionPaymentId } = await createRebindCheckout(ctx.userId);

      const first = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      const second = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });

      expect(first.paymentMethodUpdated).toBe(true);
      expect(second.paymentMethodUpdated).toBe(true);

      const paymentRow = await getSubscriptionPaymentByInternalId(
        subscriptionPaymentId,
        ctx.userId
      );
      expect(readRebindOutcome(paymentRow?.raw_last_event)).toBe(REBIND_OUTCOME_APPLIED);
    }, E2E_TIME_ANCHOR);
  });
});
