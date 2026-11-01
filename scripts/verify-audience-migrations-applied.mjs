#!/usr/bin/env node
/**
 * Post-migration checks for qualified_track_plays (082/083).
 * Requires DATABASE_URL. Does not print secrets.
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
       FROM pg_roles WHERE rolname = current_user`
    );
    console.log('Backend role:', role.rows[0]);

    const table = await client.query(
      `SELECT c.relname,
              c.relrowsecurity AS rls_enabled,
              (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'qualified_track_plays')::int AS policy_count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'qualified_track_plays'`
    );
    if (table.rows.length === 0) {
      console.error('FAIL: qualified_track_plays missing');
      process.exit(2);
    }
    console.log('Table:', table.rows[0]);

    const grants = await client.query(
      `SELECT grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'qualified_track_plays'
       ORDER BY grantee, privilege_type`
    );
    console.log('Table grants:', grants.rows);

    await client.query('SELECT COUNT(*)::int AS c FROM qualified_track_plays');
    console.log('SELECT: OK');

    const testSession = '00000000-0000-4000-8000-000000000099';
    const testAnon = '00000000-0000-4000-8000-000000000088';

    const artist = await client.query(
      `SELECT a.user_id::text AS artist_id, t.id::text AS track_uuid, a.album_id AS album_slug, t.track_id AS logical_track_id
       FROM tracks t
       INNER JOIN albums a ON a.id = t.album_id
       WHERE a.user_id IS NOT NULL AND t.duration IS NOT NULL
       LIMIT 1`
    );
    if (artist.rows[0]) {
      const row = artist.rows[0];
      await client.query(
        `INSERT INTO qualified_track_plays (
           artist_user_id, track_id, listener_anon_id, playback_session_id, duration_listened_seconds
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 30)
         ON CONFLICT (playback_session_id, track_id) DO NOTHING`,
        [row.artist_id, row.track_uuid, testAnon, testSession]
      );
      await client.query(
        `DELETE FROM qualified_track_plays
         WHERE playback_session_id = $1::uuid AND listener_anon_id = $2::uuid`,
        [testSession, testAnon]
      );
      console.log('INSERT/DELETE smoke: OK');
    } else {
      console.log('INSERT smoke: skipped (no track/album row)');
    }

    console.log('All checks passed.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
