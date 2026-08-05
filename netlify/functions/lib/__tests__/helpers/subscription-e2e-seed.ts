/**
 * PR-10 database seed builders (integration tier only).
 * Requires DATABASE_URL_TEST (or DATABASE_URL) and migrations 066–069.
 */

import { query } from '../../db';
import { mapSubscriptionRow, type Subscription, type SubscriptionRow } from '../../subscriptions';
import {
  defaultSeedSubscriptionParams,
  TEST_USER_ARTIST_A,
  TEST_USER_SUBSCRIBER,
  type SeedArchiveArtistParams,
  type SeedSubscriptionParams,
} from './subscription-e2e-fixtures';

export function resolveE2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('PR-10 integration tests require DATABASE_URL_TEST or DATABASE_URL to be set');
  }
  return url;
}

export async function truncateSubscriptionE2eTables(): Promise<void> {
  resolveE2eDatabaseUrl();
  await query('TRUNCATE subscription_payments RESTART IDENTITY CASCADE');
  await query('TRUNCATE user_archive RESTART IDENTITY CASCADE');
  await query('TRUNCATE subscriptions RESTART IDENTITY CASCADE');
  await query(`DELETE FROM users WHERE email LIKE '%@pr10-e2e.test'`);
}

export async function seedTestUser(
  userId: string,
  email?: string,
  options?: { name?: string; publicSlug?: string }
): Promise<void> {
  resolveE2eDatabaseUrl();
  const safeEmail = email ?? `${userId.slice(0, 8)}@pr10-e2e.test`;
  const name = options?.name ?? 'PR-10 E2E User';
  const publicSlug = options?.publicSlug ?? `pr10-${userId.replace(/-/g, '')}`;
  await query(
    `INSERT INTO users (id, email, password_hash, name, genre_code, public_slug)
     VALUES ($1::uuid, $2, 'pr10-e2e-placeholder-hash', $3, 'other', $4)
     ON CONFLICT (id) DO NOTHING`,
    [userId, safeEmail, name, publicSlug]
  );
}

export async function seedDefaultE2eUsers(): Promise<void> {
  await seedTestUser(TEST_USER_SUBSCRIBER, 'subscriber@pr10-e2e.test');
  await seedTestUser(TEST_USER_ARTIST_A, 'artist-a@pr10-e2e.test');
}

export async function seedSubscription(params: SeedSubscriptionParams = {}): Promise<Subscription> {
  resolveE2eDatabaseUrl();
  const p = defaultSeedSubscriptionParams(params);

  const result = await query<SubscriptionRow>(
    `INSERT INTO subscriptions (
       user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, payment_method_title,
       next_charge_at, renewal_attempt_count, scheduled_plan, first_failed_at
     ) VALUES (
       $1::uuid, $2, $3, $4, 'yookassa', $5,
       $6, $7, $8, $9,
       $10, $11, $12, $13
     )
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, payment_method_title,
       next_charge_at, renewal_attempt_count, scheduled_plan, first_failed_at,
       created_at, updated_at`,
    [
      p.userId,
      p.status,
      p.plan,
      p.slotsLimit,
      p.providerSubscriptionId ?? null,
      p.startedAt ?? null,
      p.expiresAt ?? null,
      p.paymentMethodId ?? null,
      p.paymentMethodTitle ?? null,
      p.nextChargeAt ?? null,
      p.renewalAttemptCount ?? 0,
      p.scheduledPlan ?? null,
      p.firstFailedAt ?? null,
    ]
  );

  const row = result.rows[0];
  if (!row) throw new Error('seedSubscription: INSERT returned no row');
  return mapSubscriptionRow(row);
}

export async function seedArchiveArtists(
  userId: string,
  artists: SeedArchiveArtistParams[]
): Promise<void> {
  resolveE2eDatabaseUrl();
  for (const artist of artists) {
    await query(
      `INSERT INTO user_archive (user_id, artist_user_id, is_active, locked_until)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT DO NOTHING`,
      [userId, artist.artistUserId, artist.isActive ?? true, artist.lockedUntil ?? null]
    );
  }
}

export async function loadSubscriptionForUser(userId: string): Promise<Subscription | null> {
  resolveE2eDatabaseUrl();
  const result = await query<SubscriptionRow>(
    `SELECT
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, payment_method_title,
       next_charge_at, renewal_attempt_count, scheduled_plan, first_failed_at,
       created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

export interface SubscriptionPaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: string;
  currency: string;
  plan: string | null;
  kind: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function countSubscriptionRowsForUser(userId: string): Promise<number> {
  resolveE2eDatabaseUrl();
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM subscriptions WHERE user_id = $1::uuid`,
    [userId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function loadSubscriptionPaymentsForUser(
  userId: string,
  limit = 10
): Promise<SubscriptionPaymentRow[]> {
  resolveE2eDatabaseUrl();
  const result = await query<SubscriptionPaymentRow>(
    `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount,
            currency, plan, kind, created_at, updated_at
     FROM subscription_payments
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
