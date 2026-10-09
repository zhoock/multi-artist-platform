/**
 * Polls locked_until vs subscription through dev renewal window.
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

const PASSWORD = 'DiagLock1!';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const subscriberId = crypto.randomUUID();
  const artistId = crypto.randomUUID();
  const email = `diag-lock-${subscriberId.slice(0, 8)}@pr10-e2e.test`;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const { query } = await import('../netlify/functions/lib/db');
  const { attachDevSucceededSubscriptionCheckout } = await import(
    '../netlify/functions/lib/complete-dev-payment'
  );
  const {
    createPendingSubscriptionPayment,
    getSubscriptionPaymentByInternalId,
    resolveSupportPeriodMs,
  } = await import('../netlify/functions/lib/subscription-billing');
  const { mapDevSubscriptionPaymentToProviderPayment } = await import(
    '../netlify/functions/lib/subscription-provider-payment'
  );
  const { processSubscriptionProviderPaymentForRow } = await import(
    '../netlify/functions/lib/subscription-payment-router'
  );
  const { addArtistToArchive, getMyArchiveForUser } = await import(
    '../netlify/functions/lib/archive'
  );
  const { getViewerSubscription } = await import('../netlify/functions/lib/subscriptions');
  const { isArchiveArtistLocked } = await import('../netlify/functions/lib/archive');

  console.log('dev period ms:', resolveSupportPeriodMs('explorer'));

  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Diag', 'other', $4, true, true, 'listener')`,
    [subscriberId, email, passwordHash, `diag-${subscriberId.slice(0, 8)}`]
  );
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug, is_active, is_email_verified, account_type)
     VALUES ($1::uuid, $2, $3, 'Artist', 'rock', $4, true, true, 'artist')`,
    [artistId, `a-${artistId.slice(0, 8)}@pr10-e2e.test`, passwordHash, `a-${artistId.slice(0, 8)}`]
  );
  await query(
    `INSERT INTO user_payment_settings (user_id, provider, shop_id, is_active)
     VALUES ($1::uuid, 'yookassa', 'dev-test-shop', true)
     ON CONFLICT (user_id, provider) DO UPDATE SET shop_id = EXCLUDED.shop_id, is_active = true`,
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
  const lockAtAdd = entry.lockedUntil!.toISOString();
  console.log('lock at add:', lockAtAdd);

  for (let i = 0; i <= 24; i++) {
    const now = new Date();
    const sub = await getViewerSubscription(subscriberId);
    const archive = await getMyArchiveForUser(subscriberId);
    const artist = archive.artists.find((a) => a.artistUserId === artistId);
    const dbRow = await query<{ locked_until: Date; expires_at: Date; status: string }>(
      `SELECT ua.locked_until, s.expires_at, s.status
       FROM user_archive ua
       JOIN subscriptions s ON s.user_id = ua.user_id
       WHERE ua.user_id = $1::uuid AND ua.artist_user_id = $2::uuid
       LIMIT 1`,
      [subscriberId, artistId]
    );
    const r = dbRow.rows[0];
    const lockedUntil = r?.locked_until?.toISOString() ?? null;
    const serverLocked = isArchiveArtistLocked(r?.locked_until ?? null, now);
    console.log(
      JSON.stringify({
        t: now.toISOString(),
        locked_until: lockedUntil,
        expires_at: r?.expires_at?.toISOString(),
        status: r?.status,
        api_isLocked: artist?.isLocked,
        api_lockedUntil: artist?.lockedUntil,
        serverLocked,
        lockChangedFromAdd: lockedUntil !== lockAtAdd,
      })
    );
    if (i === 24) break;
    await sleep(15_000);
  }

  await query(`DELETE FROM user_archive WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM subscriptions WHERE user_id = $1::uuid`, [subscriberId]);
  await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[subscriberId, artistId]]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
