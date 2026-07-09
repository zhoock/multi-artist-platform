/**
 * One-time migration: copy timed sync from tracks.synced_lyrics into synced_lyrics table,
 * then null out the legacy column.
 *
 * Usage: npx tsx database/scripts/migrate_legacy_track_synced_lyrics.ts
 */

import { query, getClient } from '../../netlify/functions/lib/db';
import { isTimedSync, parseSyncedLyricsJson } from '../../netlify/functions/lib/track-lyrics';

async function main() {
  const client = await getClient();
  try {
    const tracks = await query<{
      album_uuid: string;
      album_id: string;
      user_id: string;
      track_id: string;
      lang: string;
      synced_lyrics: unknown;
    }>(
      `SELECT a.id AS album_uuid, a.album_id, a.user_id, t.track_id, a.lang, t.synced_lyrics
       FROM tracks t
       INNER JOIN albums a ON a.id = t.album_id
       WHERE t.synced_lyrics IS NOT NULL AND a.user_id IS NOT NULL`
    );

    let migrated = 0;
    let cleared = 0;

    for (const row of tracks.rows) {
      const lines = parseSyncedLyricsJson(row.synced_lyrics);
      const storeLang = row.lang === 'ru' ? 'ru' : 'en';

      if (isTimedSync(lines)) {
        const existing = await query<{ id: string }>(
          `SELECT id FROM synced_lyrics
           WHERE user_id = $1 AND album_id = $2 AND track_id = $3 AND lang = $4
           LIMIT 1`,
          [row.user_id, row.album_id, row.track_id, storeLang]
        );

        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO synced_lyrics (user_id, album_id, track_id, lang, synced_lyrics, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
            [row.user_id, row.album_id, row.track_id, storeLang, JSON.stringify(lines)]
          );
          migrated += 1;
        }
      }

      await query(`UPDATE tracks SET synced_lyrics = NULL WHERE album_id = $1 AND track_id = $2`, [
        row.album_uuid,
        row.track_id,
      ]);
      cleared += 1;
    }

    console.log(
      `Migration complete. Migrated ${migrated} timed sync rows; cleared ${cleared} legacy columns.`
    );
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
