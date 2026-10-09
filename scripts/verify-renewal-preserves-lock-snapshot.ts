/**
 * Calls renewal fulfillment directly (new code) and asserts locked_until is unchanged.
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

async function main(): Promise<void> {
  const subscriberId = crypto.randomUUID();
  const artistId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash('x', 10);

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
  const { addArtistToArchive } = await import('../netlify/functions/lib/archive');
  const { applyRenewalArchiveSideEffects } = await import(
    '../netlify/functions/lib/subscription-renewal-fulfillment'
  );

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Renewal Lock', 'other', $4, true, true, 'listener')`,
    [
      subscriberId,
      `renew-lock-${subscriberId.slice(0, 8)}@pr10-e2e.test`,
      passwordHash,
      `r-${subscriberId.slice(0, 8)}`,
    ]
  );
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Artist', 'rock', $4, true, true, 'artist')`,
    [artistId, `a-${artistId.slice(0, 8)}@pr10-e2e.test`, passwordHash, `a-${artistId.slice(0, 8)}`]
  );
  await query(
    `INSERT INTO user_payment_settings (user_id, provider, shop_id, is_active)
     VALUES ($1::uuid, 'yookassa', 'dev-test-shop', true) ON CONFLICT (user_id, provider) DO UPDATE SET shop_id = EXCLUDED.shop_id`,
    [artistId]
  );

  const sp = await createPendingSubscriptionPayment(subscriberId, 'explorer', 'initial');
  const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId: sp });
  const row = await getSubscriptionPaymentByInternalId(sp, subscriberId);
  const pp = mapDevSubscriptionPaymentToProviderPayment(row!, paymentId, { devMode: true });
  await processSubscriptionProviderPaymentForRow(pp!, subscriberId, row!.kind, {
    devMode: true,
    observabilitySource: 'poll',
    subscriptionPaymentId: sp,
  });

  const entry = await addArtistToArchive(subscriberId, artistId);
  const snapshot = entry.lockedUntil!.toISOString();
  console.log('snapshot locked_until:', snapshot);

  await applyRenewalArchiveSideEffects({
    userId: subscriberId,
    slotsLimit: 20,
    expiresAt: new Date(Date.now() + 600_000),
  });

  const after = await query<{ locked_until: Date }>(
    `SELECT locked_until FROM user_archive WHERE user_id = $1::uuid AND artist_user_id = $2::uuid`,
    [subscriberId, artistId]
  );
  const afterIso = after.rows[0]?.locked_until?.toISOString();
  console.log('after renewal side effects:', afterIso);

  if (afterIso !== snapshot) {
    console.error('FAIL: locked_until changed on renewal');
    process.exitCode = 1;
  } else {
    console.log('OK: locked_until snapshot preserved');
  }

  await query(`DELETE FROM user_archive WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM subscriptions WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[subscriberId, artistId]]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
