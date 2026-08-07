/**
 * One-off probe: DB row + BillingSnapshot for a user (production shared DB).
 * Usage: npx tsx scripts/prod-billing-probe.ts [userId]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const userId = process.argv[2] ?? 'e4d5afb1-9d99-4147-9abd-e42d8ed42a58';
const listExplorer = process.argv.includes('--list-explorer');

async function main(): Promise<void> {
  const prev = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED ?? '';

  const { query } = await import('../netlify/functions/lib/db');
  const { getViewerSubscription } = await import('../netlify/functions/lib/subscriptions');
  const { buildBillingSnapshot } = await import(
    '../netlify/functions/lib/subscription-billing-snapshot'
  );
  const { isSubscriptionAutoRenewEnabled } = await import(
    '../netlify/functions/lib/subscription-feature-flag'
  );
  const { getMyArchiveForUser } = await import('../netlify/functions/lib/archive');
  const { resolveCollectionBillingScreen } = await import(
    '../src/features/premiumSubscription/lib/resolveCollectionBillingScreen'
  );

  if (listExplorer) {
    const rows = await query<{
      email: string;
      user_id: string;
      status: string;
      plan: string;
      expires_at: Date | null;
      next_charge_at: Date | null;
      payment_method_id: string | null;
    }>(
      `SELECT u.email, s.user_id, s.status, s.plan, s.expires_at, s.next_charge_at, s.payment_method_id
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'active' AND s.plan = 'explorer'
       ORDER BY s.updated_at DESC
       LIMIT 15`
    );
    console.log(JSON.stringify(rows.rows, null, 2));
    return;
  }

  const row = await query<{
    email: string;
    id: string;
    status: string;
    plan: string;
    expires_at: Date | null;
    next_charge_at: Date | null;
    payment_method_id: string | null;
    payment_method_title: string | null;
    started_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT u.email, s.id, s.status, s.plan, s.expires_at, s.next_charge_at,
            s.payment_method_id, s.payment_method_title, s.started_at, s.updated_at
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1::uuid
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );

  const sub = await getViewerSubscription(userId);
  const archive = await getMyArchiveForUser(userId);
  const snapshot = buildBillingSnapshot(sub);
  const billingScreen = resolveCollectionBillingScreen(archive.billing);

  // Simulate production function runtime (flag unset in production context).
  delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  const archiveProdRuntime = await getMyArchiveForUser(userId);
  const billingScreenProdRuntime = resolveCollectionBillingScreen(archiveProdRuntime.billing);
  if (prev === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = prev;

  const payments = await query<{
    kind: string;
    status: string;
    created_at: Date;
    provider_payment_id: string | null;
  }>(
    `SELECT kind, status, created_at, provider_payment_id
     FROM subscription_payments
     WHERE user_id = $1::uuid
     ORDER BY created_at ASC`,
    [userId]
  );

  console.log(
    JSON.stringify(
      {
        probeUserId: userId,
        netlifyProductionContextFlag:
          'SUBSCRIPTION_AUTO_RENEW_ENABLED not set (netlify env:get --context production)',
        serverFlagInLocalDotenv: prev ?? null,
        isSubscriptionAutoRenewEnabled_simulatingProductionRuntime: (() => {
          delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
          const off = isSubscriptionAutoRenewEnabled();
          if (prev === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
          else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = prev;
          return off;
        })(),
        dbRow: row.rows[0] ?? null,
        subscriptionPayments: payments.rows,
        billingFromGetMyArchive_simulatingProductionRuntime: archiveProdRuntime.billing,
        billingScreenProdRuntime,
        billingFromGetMyArchive_withLocalEnvFlagTrue: archive.billing,
        billingScreenWithLocalEnvFlagTrue: billingScreen,
        uiDisableButton_prodRuntime:
          billingScreenProdRuntime === 'ACTIVE' &&
          archiveProdRuntime.billing.autoRenewEnabled === true,
        uiDisableButton_note:
          'Also requires client bundle parseAutoRenewFlag("true") — production build has no production-context flag, so baked as ""',
      },
      null,
      2
    )
  );

  if (prev === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = prev;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
