/**
 * billing_origin isolation — dev ↔ production runtime guards (tier1-backend).
 */

import { describe, expect, test } from '@jest/globals';

import { query } from '../../../db';
import { DEV_SUPPORT_PERIOD_MS } from '../../../subscription-billing';
import { checkBillingMutationAllowed } from '../../../subscription-billing-origin';
import { processSubscriptionProviderPaymentForRow } from '../../../subscription-payment-router';
import { mapDevSubscriptionPaymentToProviderPayment } from '../../../subscription-provider-payment';
import { patchSubscriptionAutoRenew } from '../../../subscription-auto-renew-patch';
import { listChargeReadySubscriptionIds } from '../../../subscription-renewal-engine';
import { TEST_USER_SUBSCRIBER } from '../../helpers/subscription-e2e-fixtures';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { seedSubscription } from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

describe('billing_origin dev/production isolation @p0', () => {
  test('production subscription is invisible to dev renewal scheduler (production → dev)', async () => {
    if (!isE2eDatabaseConfigured()) return;

    const dueAt = new Date(Date.now() - 60_000);
    await seedSubscription({
      userId: TEST_USER_SUBSCRIBER,
      billingOrigin: 'production',
      paymentMethodId: 'pm-prod-1',
      nextChargeAt: dueAt,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'test';

    const readyIds = await listChargeReadySubscriptionIds(new Date());
    expect(readyIds).toEqual([]);
  });

  test('dev subscription is invisible to production renewal scheduler (dev → production)', async () => {
    if (!isE2eDatabaseConfigured()) return;

    const dueAt = new Date(Date.now() - 60_000);
    await seedSubscription({
      userId: TEST_USER_SUBSCRIBER,
      billingOrigin: 'dev',
      paymentMethodId: 'pm-dev-1',
      nextChargeAt: dueAt,
      expiresAt: new Date(Date.now() + DEV_SUPPORT_PERIOD_MS),
    });

    delete process.env.DEV_PAYMENT_MODE;
    process.env.NETLIFY_DEV = 'false';
    process.env.NODE_ENV = 'production';

    const readyIds = await listChargeReadySubscriptionIds(new Date());
    expect(readyIds).toEqual([]);
  });

  test('dev runtime router skips production subscription renewal fulfillment', async () => {
    if (!isE2eDatabaseConfigured()) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await seedSubscription({
      userId: TEST_USER_SUBSCRIBER,
      billingOrigin: 'production',
      expiresAt,
    });

    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'test';

    const before = await query<{ expires_at: Date }>(
      `SELECT expires_at FROM subscriptions WHERE user_id = $1::uuid`,
      [TEST_USER_SUBSCRIBER]
    );

    const result = await processSubscriptionProviderPaymentForRow(
      {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: TEST_USER_SUBSCRIBER,
          plan: 'explorer',
          kind: 'renewal',
        },
      },
      TEST_USER_SUBSCRIBER,
      'renewal',
      { observabilitySource: 'scheduler' }
    );

    expect(result).toMatchObject({ subscriptionRenewed: false, alreadyFulfilled: false });

    const after = await query<{ expires_at: Date }>(
      `SELECT expires_at FROM subscriptions WHERE user_id = $1::uuid`,
      [TEST_USER_SUBSCRIBER]
    );
    expect(after.rows[0]?.expires_at.getTime()).toBe(before.rows[0]?.expires_at.getTime());
  });

  test('production runtime router skips dev subscription poll fulfillment', async () => {
    if (!isE2eDatabaseConfigured()) return;

    const expiresAt = new Date(Date.now() + DEV_SUPPORT_PERIOD_MS);
    await seedSubscription({
      userId: TEST_USER_SUBSCRIBER,
      billingOrigin: 'dev',
      expiresAt,
    });

    await query(
      `INSERT INTO subscription_payments (
         user_id, provider, provider_payment_id, status, amount, currency, plan, kind, raw_last_event
       ) VALUES (
         $1::uuid, 'yookassa', $2, 'succeeded', 1, 'RUB', 'explorer', 'initial',
         '{"devPaymentMode": true}'::jsonb
       )`,
      [TEST_USER_SUBSCRIBER, '00000000-0000-4000-8000-000000000002']
    );

    delete process.env.DEV_PAYMENT_MODE;
    process.env.NETLIFY_DEV = 'false';
    process.env.NODE_ENV = 'production';

    const paymentRow = {
      id: 'pay-row-dev',
      user_id: TEST_USER_SUBSCRIBER,
      provider: 'yookassa',
      provider_payment_id: '00000000-0000-4000-8000-000000000002',
      status: 'succeeded',
      amount: '1.00',
      currency: 'RUB',
      plan: 'explorer',
      kind: 'initial',
      raw_last_event: { devPaymentMode: true },
    };

    const providerPayment = mapDevSubscriptionPaymentToProviderPayment(
      paymentRow,
      paymentRow.provider_payment_id,
      { devMode: false }
    );
    expect(providerPayment).toBeTruthy();

    const before = await query<{ expires_at: Date }>(
      `SELECT expires_at FROM subscriptions WHERE user_id = $1::uuid`,
      [TEST_USER_SUBSCRIBER]
    );

    const result = await processSubscriptionProviderPaymentForRow(
      providerPayment!,
      TEST_USER_SUBSCRIBER,
      'initial',
      { observabilitySource: 'poll' }
    );

    expect(result).toMatchObject({ subscriptionActivated: false, alreadyFulfilled: false });

    const after = await query<{ expires_at: Date }>(
      `SELECT expires_at FROM subscriptions WHERE user_id = $1::uuid`,
      [TEST_USER_SUBSCRIBER]
    );
    expect(after.rows[0]?.expires_at.getTime()).toBe(before.rows[0]?.expires_at.getTime());
  });

  test('patch auto-renew rejects cross-origin runtime', async () => {
    if (!isE2eDatabaseConfigured()) return;

    await seedSubscription({
      userId: TEST_USER_SUBSCRIBER,
      billingOrigin: 'production',
      paymentMethodId: 'pm-prod',
      status: 'active',
    });

    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

    const guard = checkBillingMutationAllowed({ billingOrigin: 'production' });
    expect(guard).toEqual({ allowed: false, reason: 'production_subscription_dev_runtime' });

    await expect(patchSubscriptionAutoRenew(TEST_USER_SUBSCRIBER, false)).rejects.toMatchObject({
      code: 'BILLING_ORIGIN_MISMATCH',
    });
  });
});
