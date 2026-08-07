/**
 * Seeds a loginable user with a completed autorenew cycle for UI verification.
 * Does NOT clean up — inspect at /dashboard/collection after login.
 * See docs/autorenew-verification.md
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

config({ path: resolve(process.cwd(), '.env') });

process.env.NETLIFY_DEV = 'true';
process.env.NODE_ENV = 'development';
process.env.CONTEXT = 'dev';
process.env.DEV_PAYMENT_MODE = 'true';
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

const PROOF_PASSWORD = 'AutorenewProof1!';

async function main(): Promise<void> {
  const userId = crypto.randomUUID();
  const email = `autorenew-ui-${userId.slice(0, 8)}@pr10-e2e.test`;
  const passwordHash = await bcrypt.hash(PROOF_PASSWORD, 10);

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
  const { attemptRenewalChargeForSubscription } = await import(
    '../netlify/functions/lib/subscription-renewal-engine'
  );
  const { getMyArchiveForUser } = await import('../netlify/functions/lib/archive');
  const { resolveCollectionBillingScreen } = await import(
    '../src/features/premiumSubscription/lib/resolveCollectionBillingScreen'
  );

  await query(
    `INSERT INTO users (
       id, email, password_hash, name, genre_code, public_slug,
       is_active, is_email_verified, account_type
     )
     VALUES ($1::uuid, $2, $3, 'Autorenew UI Proof', 'other', $4, true, true, 'listener')
     ON CONFLICT (id) DO NOTHING`,
    [userId, email, passwordHash, `autorenew-ui-${userId.slice(0, 8)}`]
  );

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

  await processSubscriptionProviderPaymentForRow(initialProviderPayment, userId, initialRow.kind, {
    devMode: true,
    observabilitySource: 'poll',
    subscriptionPaymentId,
  });

  let sub = await getViewerSubscription(userId);
  if (!sub?.nextChargeAt) throw new Error('Initial checkout missing next_charge_at');

  const periodEnd = sub.nextChargeAt;
  const past = new Date(periodEnd.getTime() + 60_000);

  await query(
    `UPDATE subscriptions
     SET expires_at = $2, next_charge_at = $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1::uuid`,
    [userId, periodEnd]
  );

  const chargeOutcome = await attemptRenewalChargeForSubscription(sub!.id, past);
  if (chargeOutcome !== 'attempted') {
    throw new Error(`Renewal charge failed: ${chargeOutcome}`);
  }

  sub = await getViewerSubscription(userId);
  const archive = await getMyArchiveForUser(userId);
  const billingScreen = resolveCollectionBillingScreen(archive.billing);

  console.log(
    JSON.stringify(
      {
        email,
        password: PROOF_PASSWORD,
        userId,
        subscriptionId: sub?.id,
        status: sub?.status,
        billingScreen,
        expiresAt: sub?.expiresAt?.toISOString(),
        nextChargeAt: sub?.nextChargeAt?.toISOString(),
        hasPremiumAccess: archive.billing.hasPremiumAccess,
        uiUrl: 'http://localhost:8888/dashboard/collection',
        loginUrl: 'http://localhost:8888/auth',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('seed-autorenew-ui-proof failed:', error);
  process.exit(1);
});
