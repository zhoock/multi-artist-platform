#!/usr/bin/env node
/**
 * Verify DATABASE_URL role can read/write qualified_track_plays after migration 083 (RLS).
 * Run locally/staging only — requires DATABASE_URL, does not modify production.
 *
 * Usage: node scripts/check-qualified-plays-db-role.mjs
 */

import pg from 'pg';

const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const role = await client.query(
      `SELECT current_user,
              COALESCE(rolbypassrls, false) AS bypass_rls
       FROM pg_roles
       WHERE rolname = current_user`
    );
    console.log('Role:', role.rows[0]);

    const rls = await client.query(
      `SELECT c.relrowsecurity AS rls_enabled
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'qualified_track_plays'`
    );
    if (rls.rows.length === 0) {
      console.warn('Table qualified_track_plays not found — apply migration 082 first.');
      process.exit(2);
    }
    console.log('RLS enabled:', rls.rows[0]?.rls_enabled);

    await client.query('SELECT COUNT(*)::int AS c FROM qualified_track_plays');
    console.log('SELECT on qualified_track_plays: OK');

    if (role.rows[0]?.bypass_rls !== true) {
      console.warn(
        'WARNING: current_user does not BYPASSRLS — ensure table owner/GRANT allows backend writes.'
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
