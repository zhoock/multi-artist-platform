/**
 * Trace last production checkout for a user — reads subscription_payments.raw_last_event.
 * Usage: npx tsx scripts/prod-checkout-trace.ts <userId> [providerPaymentId]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const userId = process.argv[2] ?? '0fedc381-acd8-4322-97cc-dc7fe088dedd';
const providerPaymentId = process.argv[3] ?? '32079156-000f-5000-b000-15557e11a197';

async function main(): Promise<void> {
  const { query } = await import('../netlify/functions/lib/db');
  const { mapYooKassaPaymentToProviderPayment } = await import(
    '../netlify/functions/lib/subscription-provider-payment'
  );
  const {
    resolvePaymentMethodIdFromProviderPayment,
    resolvePaymentMethodTitleFromProviderPayment,
  } = await import('../netlify/functions/lib/subscription-fulfillment');
  const { isSubscriptionAutoRenewEnabled } = await import(
    '../netlify/functions/lib/subscription-feature-flag'
  );

  const prodFlag = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  const row = await query<{
    id: string;
    kind: string;
    status: string;
    plan: string;
    provider_payment_id: string | null;
    created_at: Date;
    updated_at: Date;
    raw_last_event: unknown;
  }>(
    `SELECT id, kind, status, plan, provider_payment_id, created_at, updated_at, raw_last_event
     FROM subscription_payments
     WHERE user_id = $1::uuid AND provider_payment_id = $2
     LIMIT 1`,
    [userId, providerPaymentId]
  );

  const sub = await query<{
    id: string;
    status: string;
    provider_subscription_id: string | null;
    payment_method_id: string | null;
    next_charge_at: Date | null;
    expires_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT id, status, provider_subscription_id, payment_method_id, next_charge_at, expires_at, updated_at
     FROM subscriptions WHERE user_id = $1::uuid LIMIT 1`,
    [userId]
  );

  const paymentRow = row.rows[0];
  const raw = paymentRow?.raw_last_event as Record<string, unknown> | null;
  const providerPayment = raw ? mapYooKassaPaymentToProviderPayment(raw as never) : null;

  const pmIdProd = providerPayment
    ? resolvePaymentMethodIdFromProviderPayment(providerPayment, {})
    : null;
  const pmTitleProd = providerPayment
    ? resolvePaymentMethodTitleFromProviderPayment(providerPayment, {})
    : null;

  process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
  const pmIdFlagOn = providerPayment
    ? resolvePaymentMethodIdFromProviderPayment(providerPayment, {})
    : null;

  if (prodFlag === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = prodFlag;

  console.log(
    JSON.stringify(
      {
        userId,
        providerPaymentId,
        productionRuntimeFlag: false,
        paymentRow: paymentRow
          ? {
              id: paymentRow.id,
              kind: paymentRow.kind,
              status: paymentRow.status,
              plan: paymentRow.plan,
              created_at: paymentRow.created_at,
              updated_at: paymentRow.updated_at,
            }
          : null,
        yookassaFromRawLastEvent: raw
          ? {
              status: raw.status,
              payment_method: raw.payment_method ?? null,
            }
          : null,
        mappedProviderPayment: providerPayment
          ? {
              status: providerPayment.status,
              paymentMethod: providerPayment.paymentMethod,
            }
          : null,
        resolvePaymentMethodId_productionRuntime: pmIdProd,
        resolvePaymentMethodId_ifFlagTrue: pmIdFlagOn,
        resolvePaymentMethodTitle_productionRuntime: pmTitleProd,
        subscriptionAfterCheckout: sub.rows[0] ?? null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
