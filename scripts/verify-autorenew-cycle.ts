/**
 * End-to-end proof: initial checkout → period end → scheduler renewal → fulfillment.
 * Fast-forwards period via DB (no 1h wait). Requires DATABASE_URL + migrations 066+.
 * See docs/autorenew-verification.md
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';

config({ path: resolve(process.cwd(), '.env') });

process.env.NETLIFY_DEV = 'true';
process.env.NODE_ENV = 'development';
process.env.CONTEXT = 'dev';
process.env.DEV_PAYMENT_MODE = 'true';
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

type StepResult = { step: string; ok: boolean; detail: Record<string, unknown> };

const steps: StepResult[] = [];

function logStep(step: string, ok: boolean, detail: Record<string, unknown>): void {
  steps.push({ step, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`\n${mark} ${step}`);
  console.log(JSON.stringify(detail, null, 2));
}

async function main(): Promise<void> {
  const userId = crypto.randomUUID();
  const email = `autorenew-proof-${userId.slice(0, 8)}@pr10-e2e.test`;

  const { query } = await import('../netlify/functions/lib/db');
  const { attachDevSucceededSubscriptionCheckout } = await import(
    '../netlify/functions/lib/complete-dev-payment'
  );
  const { createPendingSubscriptionPayment, getSubscriptionPaymentByInternalId } = await import(
    '../netlify/functions/lib/subscription-billing'
  );
  const { mapDevSubscriptionPaymentToProviderPayment } = await import(
    '../netlify/functions/lib/subscription-provider-payment'
  );
  const { processSubscriptionProviderPaymentForRow } = await import(
    '../netlify/functions/lib/subscription-payment-router'
  );
  const { getViewerSubscription } = await import('../netlify/functions/lib/subscriptions');
  const { listChargeReadySubscriptionIds } = await import(
    '../netlify/functions/lib/subscription-renewal-engine'
  );
  const { buildBillingSnapshot } = await import(
    '../netlify/functions/lib/subscription-billing-snapshot'
  );
  const { getMyArchiveForUser } = await import('../netlify/functions/lib/archive');
  const { hasPremiumAccess } = await import('../netlify/functions/lib/subscription-access');
  const { resolveCollectionBillingScreen } = await import(
    '../src/features/premiumSubscription/lib/resolveCollectionBillingScreen'
  );

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug)
     VALUES ($1::uuid, $2, 'verify-autorenew-hash', 'Autorenew Proof', 'other', $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, email, `verify-${userId.slice(0, 8)}`]
  );

  // ── 1. Initial checkout (dev) ──
  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    userId,
    'archivist',
    'initial'
  );
  const { paymentId: initialProviderId } = await attachDevSucceededSubscriptionCheckout({
    subscriptionPaymentId,
  });
  const initialRow = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  if (!initialRow) throw new Error('Initial payment row missing');

  const initialProviderPayment = mapDevSubscriptionPaymentToProviderPayment(
    initialRow,
    initialProviderId,
    { devMode: true }
  );
  if (!initialProviderPayment) throw new Error('Failed to map initial dev payment');

  const initialResult = await processSubscriptionProviderPaymentForRow(
    initialProviderPayment,
    userId,
    initialRow.kind,
    { devMode: true, observabilitySource: 'poll', subscriptionPaymentId }
  );

  let sub = await getViewerSubscription(userId);
  logStep('1. Initial checkout fulfilled', initialResult.subscriptionActivated === true, {
    subscriptionActivated: initialResult.subscriptionActivated,
    status: sub?.status,
    plan: sub?.plan,
    paymentMethodId: sub?.paymentMethodId ?? null,
    expiresAt: sub?.expiresAt?.toISOString() ?? null,
    nextChargeAt: sub?.nextChargeAt?.toISOString() ?? null,
  });

  if (!sub?.paymentMethodId || !sub.nextChargeAt || !sub.expiresAt) {
    throw new Error('Initial autorenew fields missing — cannot continue proof');
  }

  const periodEnd = sub.nextChargeAt;

  // ── 2. Simulate 1h period elapsed ──
  const past = new Date(periodEnd.getTime() + 60_000);
  await query(
    `UPDATE subscriptions
     SET expires_at = $2, next_charge_at = $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1::uuid`,
    [userId, periodEnd]
  );

  sub = await getViewerSubscription(userId);
  logStep('2. Period ended (simulated)', sub!.expiresAt!.getTime() <= past.getTime(), {
    simulatedPeriodEnd: periodEnd.toISOString(),
    now: past.toISOString(),
    expiresAt: sub?.expiresAt?.toISOString(),
    nextChargeAt: sub?.nextChargeAt?.toISOString(),
  });

  // ── 3. Scheduler selection ──
  const chargeReadyIds = await listChargeReadySubscriptionIds(past);
  const selected = chargeReadyIds.includes(sub!.id);
  logStep('3. Scheduler selected subscription', selected, {
    subscriptionId: sub!.id,
    chargeReadyIds,
  });

  if (!selected) throw new Error('Subscription not in charge-ready list');

  // ── 4–6. Renewal charge for this subscription only (avoid unrelated DB rows) ──
  const { attemptRenewalChargeForSubscription } = await import(
    '../netlify/functions/lib/subscription-renewal-engine'
  );
  const chargeOutcome = await attemptRenewalChargeForSubscription(sub!.id, past);
  logStep('4. Scheduler charge attempted', chargeOutcome === 'attempted', { chargeOutcome });

  const payments = await query<{
    id: string;
    kind: string;
    status: string;
    provider_payment_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, kind, status, provider_payment_id, created_at
     FROM subscription_payments
     WHERE user_id = $1::uuid
     ORDER BY created_at ASC`,
    [userId]
  );

  const renewalPayments = payments.rows.filter((p) => p.kind === 'renewal');
  const renewalSucceeded = renewalPayments.some((p) => p.status === 'succeeded');
  logStep('5. Renewal payment created', renewalPayments.length >= 1, {
    payments: payments.rows.map((p) => ({
      kind: p.kind,
      status: p.status,
      providerPaymentId: p.provider_payment_id,
    })),
  });
  logStep('6. Renewal fulfillment succeeded', renewalSucceeded, {
    renewalCount: renewalPayments.length,
  });

  sub = await getViewerSubscription(userId);
  const oneHourMs = 60 * 60 * 1000;
  const expectedExpiresMs = past.getTime() + oneHourMs;
  const expiresMs = sub?.expiresAt?.getTime() ?? 0;
  const nextChargeMs = sub?.nextChargeAt?.getTime() ?? 0;
  const expiresExtended = expiresMs >= expectedExpiresMs - 5_000;
  const nextChargeSet = nextChargeMs >= expectedExpiresMs - 5_000;

  logStep(
    '7. Subscription dates updated (+1h period)',
    expiresExtended && nextChargeSet && sub?.status === 'active',
    {
      status: sub?.status,
      expiresAt: sub?.expiresAt?.toISOString(),
      nextChargeAt: sub?.nextChargeAt?.toISOString(),
      schedulerNow: past.toISOString(),
      expectedExpiresAt: new Date(expectedExpiresMs).toISOString(),
      previousPeriodEnd: periodEnd.toISOString(),
      periodExtensionMs: expiresMs - periodEnd.getTime(),
      paymentMethodId: sub?.paymentMethodId ?? null,
    }
  );

  // ── 8. UI / API projection ──
  const afterRenewal = new Date();
  const archive = await getMyArchiveForUser(userId);
  const billingScreen = resolveCollectionBillingScreen(archive.billing);
  const premium = hasPremiumAccess(sub, afterRenewal);
  const snapshot = buildBillingSnapshot(sub, { now: afterRenewal });

  logStep(
    '8. UI would show ACTIVE with next charge (not EXPIRED)',
    billingScreen === 'ACTIVE' &&
      premium &&
      archive.billing.nextChargeAt != null &&
      archive.billing.hasPremiumAccess,
    {
      billingScreen,
      hasPremiumAccess: premium,
      nextChargeAt: archive.billing.nextChargeAt,
      expiresAt: archive.billing.expiresAt,
      plan: archive.billing.plan,
      autoRenewEnabled: archive.billing.autoRenewEnabled,
      snapshotStatus: snapshot.status,
    }
  );

  // Cleanup
  await query(`DELETE FROM subscription_payments WHERE user_id = $1::uuid`, [userId]);
  await query(`DELETE FROM subscriptions WHERE user_id = $1::uuid`, [userId]);
  await query(`DELETE FROM users WHERE id = $1::uuid`, [userId]);

  const failed = steps.filter((s) => !s.ok);
  console.log('\n── Summary ──');
  console.log(`Steps: ${steps.length - failed.length}/${steps.length} passed`);
  if (failed.length > 0) {
    console.error(
      'Failed:',
      failed.map((f) => f.step)
    );
    process.exit(1);
  }
  console.log('Autorenew cycle proof: PASSED');
}

main().catch((error) => {
  console.error('Autorenew cycle proof: FAILED', error);
  process.exit(1);
});
