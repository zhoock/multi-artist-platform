/**
 * Group L — Payment method unlink (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  attachProviderPaymentId,
  computeSupportExpiresAt,
  createPendingSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { hasPremiumAccess } from '../../../subscription-access';
import { listChargeReadySubscriptionIds } from '../../../subscription-renewal-engine';
import { processRenewalSubscriptionProviderPayment } from '../../../subscription-renewal-fulfillment';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processInitialSubscriptionProviderPayment } from '../../../subscription-fulfillment';
import { processRebindSubscriptionProviderPayment } from '../../../subscription-rebind-fulfillment';
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
import {
  loadSubscriptionForUser,
  loadSubscriptionPaymentsForUser,
  seedSubscription,
} from '../../helpers/subscription-e2e-seed';

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

  flagOnDbTest('L-ON-006 @p0 stale rebind after unlink does not restore PM (active)', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('L-ON-006', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-09-03T00:00:00.000Z');
      const seeded = await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-l-rebind-stale',
        paymentMethodTitle: 'Visa •••• 4242',
        nextChargeAt: expiresAt,
        providerSubscriptionId: 'pay-l-rebind-initial',
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

      await unlinkSubscriptionPaymentMethod(ctx.userId);

      const unlinked = await loadSubscriptionForUser(ctx.userId);
      expect(unlinked?.paymentMethodId).toBeNull();
      expect(unlinked?.paymentMethodTitle).toBeNull();
      expect(unlinked?.nextChargeAt).toBeNull();
      expect(unlinked?.status).toBe('cancel_at_period_end');

      const first = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      expect(first.paymentMethodUpdated).toBe(false);

      let after = await loadSubscriptionForUser(ctx.userId);
      expect(after?.paymentMethodId).toBeNull();
      expect(after?.paymentMethodTitle).toBeNull();
      expect(after?.nextChargeAt).toBeNull();
      expect(after?.status).toBe('cancel_at_period_end');

      expect(await listChargeReadySubscriptionIds(E2E_TIME_ANCHOR)).not.toContain(seeded.id);

      const second = await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
        devMode: true,
      });
      expect(second.paymentMethodUpdated).toBe(false);
      expect(second.alreadyApplied).toBe(false);

      after = await loadSubscriptionForUser(ctx.userId);
      expect(after?.paymentMethodId).toBeNull();
      expect(after?.paymentMethodTitle).toBeNull();
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(
    'L-ON-007 @p0 stale rebind after unlink does not restore PM (past_due chargeable window)',
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('L-ON-007', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);

        const expiresAt = new Date('2026-08-01T00:00:00.000Z');
        const seeded = await seedSubscription({
          userId: ctx.userId,
          status: 'past_due',
          plan: 'explorer',
          expiresAt,
          paymentMethodId: 'pm-l-rebind-past-due',
          paymentMethodTitle: 'Visa •••• 9999',
          nextChargeAt: expiresAt,
          renewalAttemptCount: 1,
          firstFailedAt: new Date('2026-08-01T00:00:00.000Z'),
        });

        const subscriptionPaymentId = await createPendingSubscriptionPayment(
          ctx.userId,
          'explorer',
          'rebind'
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

        await unlinkSubscriptionPaymentMethod(ctx.userId);

        const unlinked = await loadSubscriptionForUser(ctx.userId);
        expect(unlinked?.paymentMethodId).toBeNull();
        expect(unlinked?.nextChargeAt).toBeNull();
        expect(unlinked?.status).toBe('past_due');

        await processRebindSubscriptionProviderPayment(providerPayment, ctx.userId, {
          devMode: true,
        });

        const after = await loadSubscriptionForUser(ctx.userId);
        expect(after?.paymentMethodId).toBeNull();
        expect(after?.paymentMethodTitle).toBeNull();
        expect(after?.nextChargeAt).toBeNull();
        expect(after?.status).toBe('past_due');

        expect(await listChargeReadySubscriptionIds(E2E_TIME_ANCHOR)).not.toContain(seeded.id);
      }, E2E_TIME_ANCHOR);
    }
  );

  flagOnDbTest(
    'L-ON-008 @p0 unlink during in-flight renewal honors succeeded charge without restoring PM',
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('L-ON-008', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);

        const expiresAt = new Date('2026-08-01T00:00:00.000Z');
        await seedSubscription({
          userId: ctx.userId,
          status: 'active',
          plan: 'explorer',
          expiresAt,
          paymentMethodId: 'pm-l-inflight-renewal',
          paymentMethodTitle: 'Visa •••• 4242',
          nextChargeAt: expiresAt,
          providerSubscriptionId: 'pay-l-prior-renewal',
        });

        const subscriptionPaymentId = await createPendingSubscriptionPayment(
          ctx.userId,
          'explorer',
          'renewal'
        );
        const { paymentId } = await attachDevSucceededSubscriptionCheckout({
          subscriptionPaymentId,
        });
        await attachProviderPaymentId(subscriptionPaymentId, paymentId);

        const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
        if (!row) throw new Error('payment row missing');
        const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
          devMode: true,
        });
        if (!providerPayment) throw new Error('provider payment missing');

        await unlinkSubscriptionPaymentMethod(ctx.userId);

        const unlinked = await loadSubscriptionForUser(ctx.userId);
        expect(unlinked?.status).toBe('cancel_at_period_end');
        expect(unlinked?.paymentMethodId).toBeNull();
        expect(unlinked?.nextChargeAt).toBeNull();

        const expectedExpiresAt = computeSupportExpiresAt('explorer', E2E_TIME_ANCHOR);

        const first = await processRenewalSubscriptionProviderPayment(providerPayment, ctx.userId, {
          now: E2E_TIME_ANCHOR,
        });
        expect(first.subscriptionRenewed).toBe(true);
        expect(first.alreadyFulfilled).toBe(false);

        const afterFirst = await loadSubscriptionForUser(ctx.userId);
        expect(afterFirst?.status).toBe('cancel_at_period_end');
        expect(afterFirst?.paymentMethodId).toBeNull();
        expect(afterFirst?.paymentMethodTitle).toBeNull();
        expect(afterFirst?.nextChargeAt).toBeNull();
        expect(afterFirst?.providerSubscriptionId).toBe(paymentId);
        expect(afterFirst?.expiresAt?.toISOString()).toBe(expectedExpiresAt.toISOString());
        expect(hasPremiumAccess(afterFirst, E2E_TIME_ANCHOR)).toBe(true);

        const second = await processRenewalSubscriptionProviderPayment(
          providerPayment,
          ctx.userId,
          {
            now: E2E_TIME_ANCHOR,
          }
        );
        expect(second.alreadyFulfilled).toBe(true);

        const renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
          (p) => p.kind === 'renewal'
        );
        expect(renewalPayments).toHaveLength(1);
        expect(renewalPayments[0]?.status).toBe('succeeded');

        const afterSecond = await loadSubscriptionForUser(ctx.userId);
        expect(afterSecond?.expiresAt?.toISOString()).toBe(expectedExpiresAt.toISOString());
        expect(afterSecond?.paymentMethodId).toBeNull();
        expect(afterSecond?.status).toBe('cancel_at_period_end');

        expect(await listChargeReadySubscriptionIds(E2E_TIME_ANCHOR)).not.toContain(
          afterSecond!.id
        );

        await expectInvariantSet(
          afterSecond!,
          { violations: [] },
          { context: ctx, now: E2E_TIME_ANCHOR }
        );
      }, E2E_TIME_ANCHOR);
    }
  );

  flagOnDbTest(
    'L-ON-009 @p0 unlink during in-flight renewal ignores canceled callback without dunning',
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('L-ON-009', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);

        const expiresAt = new Date('2026-08-01T00:00:00.000Z');
        await seedSubscription({
          userId: ctx.userId,
          status: 'active',
          plan: 'explorer',
          expiresAt,
          paymentMethodId: 'pm-l-inflight-cancel',
          nextChargeAt: expiresAt,
          providerSubscriptionId: 'pay-l-prior-cancel',
        });

        const subscriptionPaymentId = await createPendingSubscriptionPayment(
          ctx.userId,
          'explorer',
          'renewal'
        );
        const providerPaymentId = '55555555-5555-4555-8555-555555555555';
        await attachProviderPaymentId(subscriptionPaymentId, providerPaymentId);

        await unlinkSubscriptionPaymentMethod(ctx.userId);

        const canceledPayment = {
          id: providerPaymentId,
          status: 'canceled' as const,
          amount: { value: '1.00', currency: 'RUB' },
          metadata: {
            productType: 'premium_subscription',
            userId: ctx.userId,
            plan: 'explorer',
            kind: 'renewal',
          },
          paymentMethod: null,
        };

        const result = await processRenewalSubscriptionProviderPayment(canceledPayment, ctx.userId);
        expect(result.subscriptionRenewed).toBe(false);

        const after = await loadSubscriptionForUser(ctx.userId);
        expect(after?.status).toBe('cancel_at_period_end');
        expect(after?.paymentMethodId).toBeNull();
        expect(after?.nextChargeAt).toBeNull();
        expect(after?.renewalAttemptCount).toBe(0);
        expect(after?.expiresAt?.toISOString()).toBe(expiresAt.toISOString());

        const renewalPayments = (await loadSubscriptionPaymentsForUser(ctx.userId, 20)).filter(
          (p) => p.kind === 'renewal'
        );
        expect(renewalPayments).toHaveLength(1);
        expect(renewalPayments[0]?.status).toBe('canceled');
      }, E2E_TIME_ANCHOR);
    }
  );

  flagOnDbTest(
    'L-ON-010 @p1 unlink cancels orphan pending renewal before YooKassa POST',
    async () => {
      await withFrozenTime(async () => {
        const ctx = createE2eContext('L-ON-010', { frozenNow: E2E_TIME_ANCHOR });
        setActiveE2eContext(ctx);

        const expiresAt = new Date('2026-09-03T00:00:00.000Z');
        await seedSubscription({
          userId: ctx.userId,
          status: 'active',
          plan: 'explorer',
          expiresAt,
          paymentMethodId: 'pm-l-orphan-renewal',
          nextChargeAt: expiresAt,
        });

        const subscriptionPaymentId = await createPendingSubscriptionPayment(
          ctx.userId,
          'explorer',
          'renewal'
        );

        await unlinkSubscriptionPaymentMethod(ctx.userId);

        const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
        expect(row?.status).toBe('canceled');
        expect(row?.provider_payment_id).toBeNull();
      }, E2E_TIME_ANCHOR);
    }
  );
});
