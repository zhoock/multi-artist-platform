/**
 * DB sync for tracks.has_stems (best-effort; ignores missing column / errors).
 */

import { query } from './db';

export async function syncTrackHasStemsInDb(params: {
  artistUserId: string;
  albumId: string;
  trackId: string;
  hasStems: boolean;
}): Promise<void> {
  const { artistUserId, albumId, trackId, hasStems } = params;
  try {
    await query(
      `UPDATE tracks t
       SET has_stems = $1::boolean, updated_at = NOW()
       FROM albums a
       WHERE t.album_id = a.id
         AND a.user_id = $2::uuid
         AND a.album_id = $3
         AND t.track_id = $4`,
      [hasStems, artistUserId, albumId, trackId]
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const missingColumn =
      err?.code === '42703' ||
      (typeof err?.message === 'string' && err.message.includes('has_stems'));
    if (!missingColumn) {
      console.warn('[track-has-stems] sync failed:', error);
    }
  }
}
