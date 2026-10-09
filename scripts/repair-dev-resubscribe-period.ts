/**
 * Guarded repair of one dev-origin resubscribe that was stored with the catalog period.
 * Reads the row, confirms the existing YooKassa payment, then updates expires_at,
 * next_charge_at, and billing_origin. Does not create a payment.
 *
 * Usage: npx tsx scripts/repair-dev-resubscribe-period.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const TARGET = {
  subscriptionId: 'ed7c1ee2-c3fb-4082-bb3a-7714214b5486',
  operationId: 'fdf2975f-c768-4164-8cd5-0ec6bde5ea02',
  providerSubscriptionId: '325b203f-000f-5000-b000-118c53aaa8d7',
  plan: 'archivist',
  startedAt: new Date('2026-10-09T16:18:05.591Z'),
  appliedExpiresAt: new Date('2026-11-08T16:18:05.591Z'),
  appliedNextChargeAt: new Date('2026-11-08T16:18:05.591Z'),
} as const;

interface SubscriptionRepairRow {
  id: string;
  plan: string;
  status: string;
  billing_origin: string | null;
  started_at: Date;
  expires_at: Date;
  next_charge_at: Date | null;
  provider_subscription_id: string | null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function main(): Promise<void> {
  const { query } = await import('../netlify/functions/lib/db');
  const { planDevResubscribePeriodRepair } = await import(
    '../netlify/functions/lib/subscription-billing'
  );
  const { fetchPaymentFromYooKassaApi } = await import(
    '../netlify/functions/lib/yookassa-webhook-verify'
  );
  const { getYooKassaEnvCredentials } = await import('../netlify/functions/lib/yookassa-env');

  const current = await query<SubscriptionRepairRow>(
    `SELECT id, plan, status, billing_origin, started_at, expires_at, next_charge_at,
            provider_subscription_id
     FROM subscriptions
     WHERE id = $1::uuid`,
    [TARGET.subscriptionId]
  );
  const row = current.rows[0];
  if (!row) {
    console.log(JSON.stringify({ action: 'reject', reason: 'subscription_missing' }));
    process.exitCode = 1;
    return;
  }

  const plan = planDevResubscribePeriodRepair(
    {
      subscriptionId: row.id,
      plan: row.plan,
      status: row.status,
      billingOrigin: row.billing_origin,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      nextChargeAt: row.next_charge_at,
      providerSubscriptionId: row.provider_subscription_id,
    },
    TARGET
  );

  console.log(
    JSON.stringify({
      phase: 'before',
      status: row.status,
      plan: row.plan,
      billingOrigin: row.billing_origin,
      startedAt: iso(row.started_at),
      expiresAt: iso(row.expires_at),
      nextChargeAt: iso(row.next_charge_at),
      providerSubscriptionId: row.provider_subscription_id,
      repair: plan.action,
    })
  );

  if (plan.action !== 'repair') {
    process.exitCode = plan.action === 'already_correct' ? 0 : 1;
    return;
  }

  const operation = await query<{
    id: string;
    status: string;
    kind: string;
    provider_payment_id: string | null;
  }>(
    `SELECT id, status, kind, provider_payment_id
     FROM subscription_payments
     WHERE id = $1::uuid`,
    [TARGET.operationId]
  );
  const payment = operation.rows[0];
  if (
    !payment ||
    payment.status !== 'succeeded' ||
    payment.kind !== 'initial' ||
    payment.provider_payment_id !== TARGET.providerSubscriptionId
  ) {
    console.log(JSON.stringify({ action: 'reject', reason: 'operation_mismatch' }));
    process.exitCode = 1;
    return;
  }

  const credentials = getYooKassaEnvCredentials();
  if (!credentials) {
    console.log(JSON.stringify({ action: 'reject', reason: 'yookassa_not_configured' }));
    process.exitCode = 1;
    return;
  }

  const remote = await fetchPaymentFromYooKassaApi(
    TARGET.providerSubscriptionId,
    credentials.shopId,
    credentials.secretKey
  );
  if (!remote.ok) {
    console.log(
      JSON.stringify({ action: 'reject', reason: 'yookassa_fetch_failed', status: remote.status })
    );
    process.exitCode = 1;
    return;
  }

  const remotePayment = remote.payment as typeof remote.payment & { test?: boolean };
  if (
    remotePayment.status !== 'succeeded' ||
    remotePayment.paid !== true ||
    remotePayment.test !== true ||
    remotePayment.id !== TARGET.providerSubscriptionId
  ) {
    console.log(
      JSON.stringify({
        action: 'reject',
        reason: 'yookassa_not_succeeded_test_payment',
        status: remotePayment.status,
        paid: remotePayment.paid === true,
        test: remotePayment.test === true,
      })
    );
    process.exitCode = 1;
    return;
  }

  const updated = await query<SubscriptionRepairRow>(
    `UPDATE subscriptions
     SET expires_at = $2,
         next_charge_at = $3,
         billing_origin = 'dev',
         status = $10,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND provider_subscription_id = $4
       AND plan = $5
       AND status = $6
       AND started_at = $7
       AND expires_at = $8
       AND next_charge_at = $9
       AND billing_origin = 'production'
     RETURNING id, plan, status, billing_origin, started_at, expires_at, next_charge_at,
               provider_subscription_id`,
    [
      TARGET.subscriptionId,
      plan.expiresAt,
      plan.nextChargeAt,
      TARGET.providerSubscriptionId,
      TARGET.plan,
      row.status,
      row.started_at,
      row.expires_at,
      row.next_charge_at,
      plan.status,
    ]
  );

  const next = updated.rows[0];
  if (!next) {
    console.log(JSON.stringify({ action: 'reject', reason: 'update_matched_zero_rows' }));
    process.exitCode = 1;
    return;
  }

  const paymentAfter = await query<{ status: string; provider_payment_id: string | null }>(
    `SELECT status, provider_payment_id FROM subscription_payments WHERE id = $1::uuid`,
    [TARGET.operationId]
  );

  console.log(
    JSON.stringify({
      phase: 'after',
      billingOrigin: next.billing_origin,
      startedAt: iso(next.started_at),
      expiresAt: iso(next.expires_at),
      nextChargeAt: iso(next.next_charge_at),
      providerSubscriptionId: next.provider_subscription_id,
      paymentStatus: paymentAfter.rows[0]?.status ?? null,
      paymentUnchanged:
        paymentAfter.rows[0]?.status === 'succeeded' &&
        paymentAfter.rows[0]?.provider_payment_id === TARGET.providerSubscriptionId,
    })
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'repair failed';
  console.log(JSON.stringify({ action: 'reject', reason: message }));
  process.exitCode = 1;
});
