#!/usr/bin/env tsx
/**
 * CI guard: ensure subscription autoprenew migrations 066–070 are applied.
 * Requires DATABASE_URL (fresh Postgres after `npm run migrate`).
 */

import { Pool } from 'pg';

const REQUIRED_MIGRATIONS = [
  '066_subscription_auto_renew_schema.sql',
  '067_subscription_payments_kind.sql',
  '068_subscription_payment_method_title.sql',
  '069_subscription_autorenew_backfill.sql',
  '070_subscriptions_unique_user_id.sql',
  '073_subscriptions_billing_origin.sql',
] as const;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  const connectionUrl = databaseUrl.toLowerCase();
  const useSsl =
    connectionUrl.includes('supabase.com') &&
    !connectionUrl.includes('localhost') &&
    !connectionUrl.includes('127.0.0.1');

  const pool = new Pool({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  try {
    const { rows } = await pool.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations WHERE filename = ANY($1::text[])`,
      [REQUIRED_MIGRATIONS]
    );
    const applied = new Set(rows.map((r) => r.filename));
    const missing = REQUIRED_MIGRATIONS.filter((f) => !applied.has(f));

    if (missing.length > 0) {
      console.error('❌ Missing subscription migrations:', missing.join(', '));
      process.exit(1);
    }

    console.log('✅ Subscription migrations 066–073 verified');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
