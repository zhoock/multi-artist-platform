/**
 * PR-10.2 — Payment/webhook idempotency regression tests (tier1-backend).
 */

import { describe, expect, test } from '@jest/globals';
import crypto from 'node:crypto';

import { attachDevSucceededSubscriptionCheckout } from '../../../complete-dev-payment';
import {
  attachProviderPaymentId,
  claimSubscriptionPaymentCanceled,
  createPendingSubscriptionPayment,
  fulfillSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
} from '../../../subscription-billing';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { processSubscriptionProviderPaymentForRow } from '../../../subscription-payment-router';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import { createE2eContext } from '../../helpers/subscription-e2e-fixtures';
import {
  countSubscriptionRowsForUser,
  loadSubscriptionForUser,
  seedSubscription,
} from '../../helpers/subscription-e2e-seed';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';

registerTier1BackendHooks();

const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

async function buildDevProviderPayment(
  userId: string,
  kind: 'initial' | 'upgrade',
  plan = 'explorer'
) {
  const subscriptionPaymentId = await createPendingSubscriptionPayment(userId, plan, kind);
  const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
  const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  if (!row?.provider_payment_id) throw new Error('provider_payment_id missing');
  const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
    devMode: true,
  });
  if (!providerPayment) throw new Error('provider payment mapping failed');
  return { providerPayment, row, paymentId };
}

describe('PR-10.2 — payment idempotency @tier1 @p0', () => {
  flagOnDbTest('duplicate webhook delivery is idempotent', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('PR-10.2-dup-webhook', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const { providerPayment, row } = await buildDevProviderPayment(ctx.userId, 'initial');

      const first = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );
      const second = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );

      expect(first.subscriptionActivated).toBe(true);
      expect(second.alreadyFulfilled).toBe(true);
      expect(await countSubscriptionRowsForUser(ctx.userId)).toBe(1);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('webhook + poll concurrent fulfillment is idempotent', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('PR-10.2-race', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const { providerPayment, row } = await buildDevProviderPayment(ctx.userId, 'initial');

      const [a, b] = await Promise.all([
        processSubscriptionProviderPaymentForRow(providerPayment, ctx.userId, row.kind, {
          devMode: true,
        }),
        processSubscriptionProviderPaymentForRow(providerPayment, ctx.userId, row.kind, {
          devMode: true,
        }),
      ]);

      expect(a.subscriptionActivated || b.subscriptionActivated).toBe(true);
      expect(await countSubscriptionRowsForUser(ctx.userId)).toBe(1);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.providerSubscriptionId).toBe(providerPayment.id);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('canceled payment cannot be resurrected to succeeded', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('PR-10.2-canceled-replay', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const subscriptionPaymentId = await createPendingSubscriptionPayment(
        ctx.userId,
        'explorer',
        'initial'
      );
      const paymentId = crypto.randomUUID();
      await attachProviderPaymentId(subscriptionPaymentId, paymentId);
      await claimSubscriptionPaymentCanceled(paymentId, ctx.userId);

      const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, ctx.userId);
      if (!row) throw new Error('payment row missing');
      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(row, paymentId, {
        devMode: true,
      });
      if (!providerPayment) throw new Error('provider payment mapping failed');

      const result = await processSubscriptionProviderPaymentForRow(
        providerPayment,
        ctx.userId,
        row.kind,
        { devMode: true }
      );

      expect(result.subscriptionActivated).toBe(false);
      expect(await loadSubscriptionForUser(ctx.userId)).toBeNull();
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('concurrent first checkout creates only one subscription row', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('PR-10.2-dup-checkout', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await Promise.all([
        fulfillSubscriptionPayment({
          userId: ctx.userId,
          planSlug: 'explorer',
          providerPaymentId: 'pay-race-a',
        }),
        fulfillSubscriptionPayment({
          userId: ctx.userId,
          planSlug: 'explorer',
          providerPaymentId: 'pay-race-b',
        }),
      ]);

      expect(await countSubscriptionRowsForUser(ctx.userId)).toBe(1);
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest('concurrent upgrade fulfillment is idempotent', async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('PR-10.2-upgrade-race', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        slotsLimit: 20,
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: 'pm-existing',
        nextChargeAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      const { providerPayment, row } = await buildDevProviderPayment(
        ctx.userId,
        'upgrade',
        'collector'
      );

      const [a, b] = await Promise.all([
        processSubscriptionProviderPaymentForRow(providerPayment, ctx.userId, row.kind, {
          devMode: true,
        }),
        processSubscriptionProviderPaymentForRow(providerPayment, ctx.userId, row.kind, {
          devMode: true,
        }),
      ]);

      expect(a.subscriptionActivated || b.subscriptionActivated).toBe(true);
      expect(await countSubscriptionRowsForUser(ctx.userId)).toBe(1);

      const subscription = await loadSubscriptionForUser(ctx.userId);
      expect(subscription?.plan).toBe('collector');
      expect(subscription?.providerSubscriptionId).toBe(providerPayment.id);
    }, E2E_TIME_ANCHOR);
  });
});
