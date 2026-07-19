#!/usr/bin/env tsx
/**
 * Backfill tracks.has_stems from Storage stems.json.
 *
 * For each logical track (user_id + album_id + track_id), probes stems.json once
 * and writes the same has_stems value to ALL locale rows of that track.
 *
 * Usage:
 *   npx tsx scripts/backfill-tracks-has-stems.ts
 *
 * Requires: DATABASE_URL, SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const STORAGE_BUCKET = 'user-media';

type LogicalTrack = {
  user_id: string;
  album_slug: string;
  track_id: string;
};

function parseManifestHasStems(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { stems?: unknown };
    return Array.isArray(parsed.stems) && parsed.stems.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // One Storage probe per logical track (not per locale row).
  const { rows } = await pool.query<LogicalTrack>(
    `SELECT DISTINCT
       a.user_id::text AS user_id,
       a.album_id AS album_slug,
       t.track_id
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE a.user_id IS NOT NULL
     ORDER BY a.user_id::text, a.album_id, t.track_id`
  );

  console.log(`Scanning ${rows.length} logical track(s) for stems.json…`);

  let logicalWithStems = 0;
  let localeRowsUpdated = 0;
  let errors = 0;

  for (const row of rows) {
    const storagePath = `users/${row.user_id}/audio/${row.album_slug}/${row.track_id}/stems.json`;
    let nextHasStems = false;

    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
      if (!error && data) {
        const text = await data.text();
        nextHasStems = parseManifestHasStems(text);
      }
    } catch {
      nextHasStems = false;
    }

    if (nextHasStems) logicalWithStems += 1;

    try {
      // All locale rows for this physical track get the same flag.
      const result = await pool.query(
        `UPDATE tracks t
         SET has_stems = $1::boolean, updated_at = NOW()
         FROM albums a
         WHERE t.album_id = a.id
           AND a.user_id = $2::uuid
           AND a.album_id = $3
           AND t.track_id = $4
           AND t.has_stems IS DISTINCT FROM $1::boolean`,
        [nextHasStems, row.user_id, row.album_slug, row.track_id]
      );
      localeRowsUpdated += result.rowCount ?? 0;
    } catch (error) {
      errors += 1;
      console.warn(`Failed to update ${row.album_slug}/${row.track_id}:`, error);
    }
  }

  const inconsistent = await pool.query<{
    album_slug: string;
    track_id: string;
    true_count: string;
    false_count: string;
  }>(
    `SELECT
       a.album_id AS album_slug,
       t.track_id,
       COUNT(*) FILTER (WHERE t.has_stems) AS true_count,
       COUNT(*) FILTER (WHERE NOT t.has_stems) AS false_count
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE a.user_id IS NOT NULL
     GROUP BY a.user_id, a.album_id, t.track_id
     HAVING COUNT(*) FILTER (WHERE t.has_stems) > 0
        AND COUNT(*) FILTER (WHERE NOT t.has_stems) > 0`
  );

  console.log(
    `Done. logicalWithStems=${logicalWithStems}, localeRowsUpdated=${localeRowsUpdated}, errors=${errors}`
  );

  if (inconsistent.rows.length > 0) {
    console.error('❌ Inconsistent has_stems across locales still present:');
    console.error(JSON.stringify(inconsistent.rows, null, 2));
    await pool.end();
    process.exit(1);
  }

  console.log('✓ No locale mismatch for has_stems (all locales of a track share the same value).');
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
