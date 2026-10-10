/**
 * Dev check: lock snapshot expired while subscription still active (expires_at extended).
 * Then backend remove must succeed. UI should show trash, not lock.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

import { assertLocalDatabaseForScript } from '../netlify/functions/lib/local-database-guard';

config({ path: resolve(process.cwd(), '.env') });

process.env.NETLIFY_DEV = 'true';
process.env.NODE_ENV = 'development';
process.env.CONTEXT = 'dev';
process.env.DEV_PAYMENT_MODE = 'true';
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'false';

const PASSWORD = 'CollectionLockVerify1!';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  assertLocalDatabaseForScript('verify-collection-lock-active-sub-local');

  const subscriberId = crypto.randomUUID();
  const artistId = crypto.randomUUID();
  const email = `collection-lock-ui-${subscriberId.slice(0, 8)}@pr10-e2e.test`;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

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
  const { addArtistToArchive, removeArtistFromArchive } = await import(
    '../netlify/functions/lib/archive'
  );
  const { hasPremiumAccess } = await import('../netlify/functions/lib/subscription-access');
  const { getViewerSubscription } = await import('../netlify/functions/lib/subscriptions');
  const { isArchiveArtistLocked } = await import('../netlify/functions/lib/archive');

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Lock UI Subscriber', 'other', $4, true, true, 'listener')`,
    [subscriberId, email, passwordHash, `lock-ui-${subscriberId.slice(0, 8)}`]
  );
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Lock UI Artist', 'rock', $4, true, true, 'artist')`,
    [
      artistId,
      `lock-ui-artist-${artistId.slice(0, 8)}@pr10-e2e.test`,
      passwordHash,
      `lock-ui-artist-${artistId.slice(0, 8)}`,
    ]
  );
  await query(
    `INSERT INTO user_payment_settings (user_id, provider, shop_id, is_active)
     VALUES ($1::uuid, 'yookassa', 'dev-test-shop', true)
     ON CONFLICT (user_id, provider) DO UPDATE SET shop_id = EXCLUDED.shop_id, is_active = true`,
    [artistId]
  );

  const subscriptionPaymentId = await createPendingSubscriptionPayment(
    subscriberId,
    'explorer',
    'initial'
  );
  const { paymentId: providerId } = await attachDevSucceededSubscriptionCheckout({
    subscriptionPaymentId,
  });
  const payRow = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, subscriberId);
  if (!payRow) throw new Error('payment row missing');
  const providerPayment = mapDevSubscriptionPaymentToProviderPayment(payRow, providerId, {
    devMode: true,
  });
  if (!providerPayment) throw new Error('provider payment map failed');
  await processSubscriptionProviderPaymentForRow(providerPayment, subscriberId, payRow.kind, {
    devMode: true,
    observabilitySource: 'poll',
    subscriptionPaymentId,
  });

  const entry = await addArtistToArchive(subscriberId, artistId);
  console.log('locked_until after add:', entry.lockedUntil?.toISOString());

  await query(
    `UPDATE subscriptions
     SET expires_at = NOW() + INTERVAL '2 hours', status = 'active', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1::uuid`,
    [subscriberId]
  );

  const waitMs = Math.max(0, entry.lockedUntil!.getTime() - Date.now()) + 1500;
  console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for dev lock window…`);
  await sleep(waitMs);

  const sub = await getViewerSubscription(subscriberId);
  const premium = hasPremiumAccess(sub);
  const locked = isArchiveArtistLocked(entry.lockedUntil);
  console.log('After wait — premium:', premium, 'lock snapshot expired:', !locked);

  const removed = await removeArtistFromArchive(subscriberId, artistId);
  if (!removed) throw new Error('remove failed');
  console.log('OK: backend remove with active subscription after lock snapshot expired');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
