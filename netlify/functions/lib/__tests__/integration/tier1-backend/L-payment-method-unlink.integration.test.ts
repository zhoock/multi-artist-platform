/**
 * Group L — Payment method unlink (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { hasPremiumAccess } from '../../../subscription-access';
import { listChargeReadySubscriptionIds } from '../../../subscription-renewal-engine';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processInitialSubscriptionProviderPayment } from '../../../subscription-fulfillment';
import { unlinkSubscriptionPaymentMethod } from '../../../subscription-payment-method-unlink';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  expectBillingSnapshot,
  expectInvariantSet,
  expectSubscriptionState,
} from '../../helpers/subscription-e2e-assertions';
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

describe('Group L — Payment method unlink @tier1', () => {
  flagOnDbTest('L-ON-001 @p0 active + PM → unlink clears PM and disables auto-renew', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-09-03T00:00:00.000Z');
      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-l-active',
        paymentMethodTitle: 'Visa •••• 1111',
        nextChargeAt: expiresAt,
        providerSubscriptionId: 'pay-l-initial',
      });

      const before = await loadSubscriptionForUser(ctx.userId);
      expect(before?.paymentMethodId).toBe('pm-l-active');

      const { subscription, billing, unlinked } = await unlinkSubscriptionPaymentMethod(ctx.userId);

      expect(unlinked).toBe(true);

      await expectSubscriptionState(
        subscription,
        {
          status: 'cancel_at_period_end',
          paymentMethodId: null,
          paymentMethodTitle: null,
          nextChargeAt: null,
          expiresAt,
        },
        { context: ctx }
      );

      await expectBillingSnapshot(billing, {
        status: 'cancel_at_period_end',
        autoRenewEnabled: false,
        hasSavedPaymentMethod: false,
        paymentMethodTitle: null,
        hasPremiumAccess: true,
      });

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);
      expect(subscription.expiresAt?.toISOString()).toBe(expiresAt.toISOString());

      await expectInvariantSet(
        subscription,
        { violations: [] },
        { context: ctx, now: E2E_TIME_ANCHOR }
      );
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('L-ON-002 @p0 scheduler skips subscription after unlink', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-002', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-08-09T00:00:00.000Z');
      const seeded = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-l-scheduler',
        nextChargeAt: expiresAt,
      });

      const { subscription } = await unlinkSubscriptionPaymentMethod(ctx.userId);
      expect(subscription.paymentMethodId).toBeNull();

      const chargeReady = await listChargeReadySubscriptionIds(E2E_TIME_ANCHOR);
      expect(chargeReady).not.toContain(seeded.id);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('L-ON-003 @p1 idempotent second DELETE', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-003', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-09-03T00:00:00.000Z');
      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-l-idempotent',
        nextChargeAt: expiresAt,
      });

      const first = await unlinkSubscriptionPaymentMethod(ctx.userId);
      expect(first.unlinked).toBe(true);

      const second = await unlinkSubscriptionPaymentMethod(ctx.userId);
      expect(second.unlinked).toBe(false);
      expect(second.subscription.paymentMethodId).toBeNull();
      expect(second.billing.hasSavedPaymentMethod).toBe(false);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('L-ON-004 @p1 DELETE without subscription → 404', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-004', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await expect(unlinkSubscriptionPaymentMethod(ctx.userId)).rejects.toMatchObject({
        code: 'NO_SUBSCRIPTION',
        httpStatus: 404,
      });
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('L-ON-005 @p0 stale initial webhook does not restore PM after unlink', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-005', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'initial'
      );
      const { paymentId } = await attachDevSucceededSubscriptionCheckout({
        subscriptionPaymentId,
      });
      const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
      if (!row) throw new Error('payment row missing');

      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
        devMode: true,
      });
      if (!providerPayment) throw new Error('provider payment missing');

      await processInitialSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });

      const linked = await loadSubscriptionForUser(ctx.userId);
      expect(linked?.paymentMethodId).toBeTruthy();

      await unlinkSubscriptionPaymentMethod(ctx.userId);

      await processInitialSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });

      const after = await loadSubscriptionForUser(ctx.userId);
      expect(after?.paymentMethodId).toBeNull();
      expect(after?.paymentMethodTitle).toBeNull();
      expect(after?.status).toBe('cancel_at_period_end');
    }, E2E_TIME_ANCHOR);
  });
});
