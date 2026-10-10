/**
 * Local stand: dev 5-minute support period → add artist → wait for locked_until → remove.
 * Run: cross-env NETLIFY_DEV=true NODE_ENV=development DEV_PAYMENT_MODE=true tsx scripts/verify-collection-lock-expiry-local.ts
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
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'false';

const PASSWORD = 'CollectionLockVerify1!';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const subscriberId = crypto.randomUUID();
  const artistId = crypto.randomUUID();
  const email = `collection-lock-${subscriberId.slice(0, 8)}@pr10-e2e.test`;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const { query } = await import('../netlify/functions/lib/db');
  const { attachDevSucceededSubscriptionCheckout } = await import(
    '../netlify/functions/lib/complete-dev-payment'
  );
  const {
    createPendingSubscriptionPayment,
    getSubscriptionPaymentByInternalId,
    SUPPORT_PERIOD_MS,
  } = await import('../netlify/functions/lib/subscription-billing');
  const { mapDevSubscriptionPaymentToProviderPayment } = await import(
    '../netlify/functions/lib/subscription-provider-payment'
  );
  const { processSubscriptionProviderPaymentForRow } = await import(
    '../netlify/functions/lib/subscription-payment-router'
  );
  const { getViewerSubscription } = await import('../netlify/functions/lib/subscriptions');
  const {
    addArtistToArchive,
    removeArtistFromArchive,
    ArchiveArtistLockedError,
    ArchiveSubscriptionRequiredError,
  } = await import('../netlify/functions/lib/archive');
  const { hasPremiumAccess } = await import('../netlify/functions/lib/subscription-access');
  const { isArchiveArtistLocked } = await import('../netlify/functions/lib/archive');

  const periodMs = SUPPORT_PERIOD_MS;
  console.log(`Support period: ${Math.round(periodMs / 1000)}s`);

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Lock Verify Subscriber', 'other', $4, true, true, 'listener')`,
    [subscriberId, email, passwordHash, `lock-sub-${subscriberId.slice(0, 8)}`]
  );

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Lock Verify Artist', 'rock', $4, true, true, 'artist')`,
    [
      artistId,
      `collection-lock-artist-${artistId.slice(0, 8)}@pr10-e2e.test`,
      passwordHash,
      `lock-artist-${artistId.slice(0, 8)}`,
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

  const subAfterPay = await getViewerSubscription(subscriberId);
  if (!subAfterPay?.expiresAt) throw new Error('subscription missing expires_at');
  console.log('Subscription expires_at:', subAfterPay.expiresAt.toISOString());

  const entry = await addArtistToArchive(subscriberId, artistId);
  console.log('Added artist. locked_until:', entry.lockedUntil?.toISOString());

  try {
    await removeArtistFromArchive(subscriberId, artistId);
    console.error('FAIL: remove succeeded while lock should be active');
    process.exitCode = 1;
    return;
  } catch (e) {
    if (!(e instanceof ArchiveArtistLockedError)) {
      console.error('FAIL: expected ArchiveArtistLockedError, got', e);
      process.exitCode = 1;
      return;
    }
    console.log('OK: remove blocked while locked (409 path)');
  }

  const lockedUntilMs = entry.lockedUntil!.getTime();
  const waitMs = Math.max(0, lockedUntilMs - Date.now()) + 1500;
  console.log(`Waiting ${Math.ceil(waitMs / 1000)}s until locked_until + 1.5s…`);
  await sleep(waitMs);

  const subNow = await getViewerSubscription(subscriberId);
  const premium = hasPremiumAccess(subNow);
  const locked = isArchiveArtistLocked(entry.lockedUntil);
  console.log(
    'After wait — premium:',
    premium,
    'artistLocked:',
    locked,
    'expires_at:',
    subNow?.expiresAt?.toISOString()
  );

  try {
    const removed = await removeArtistFromArchive(subscriberId, artistId);
    if (!removed) {
      console.error('FAIL: remove returned false');
      process.exitCode = 1;
      return;
    }
    console.log('OK: backend remove succeeded after lock expired');
  } catch (e) {
    if (e instanceof ArchiveSubscriptionRequiredError) {
      console.log(
        'NOTE: remove rejected — subscription inactive (expected if period ended with auto-renew off). Lock expired:',
        !locked
      );
    } else {
      console.error('FAIL: remove after wait:', e);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nLogin for manual UI check (if dev server running):');
  console.log('  email:', email);
  console.log('  password:', PASSWORD);
  console.log('  /dashboard/collection');

  await query(`DELETE FROM user_archive WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM subscriptions WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[subscriberId, artistId]]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
