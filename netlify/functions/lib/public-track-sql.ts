/**
 * SQL mirror of src/shared/lib/tracks/publicTrackPresentation.ts — the rule the public album
 * mapper and thin catalog apply in JS. Catalog / search / sitemap gates must never count a
 * track the album page hides, otherwise an artist or album stays listed with an empty or
 * unplayable tracklist.
 *
 * Only `ready` main audio is playable: `pending` / `processing` have no stream yet, and `failed`
 * includes rows reconciled after their playback file vanished from Storage.
 */

/** Ordinary listenable track: not hidden and main audio fully processed. */
export function publicPlayableTrackSql(alias: string): string {
  return (
    `(COALESCE(${alias}.visibility, 'public') <> 'hidden'` +
    ` AND COALESCE(${alias}.processing_status, 'ready') = 'ready')`
  );
}

/** Listed on the public album page: playable, or a mixer-only row (hidden track, visible stems). */
export function publicListedTrackSql(alias: string): string {
  return (
    `(${publicPlayableTrackSql(alias)}` +
    ` OR (COALESCE(${alias}.visibility, 'public') = 'hidden'` +
    ` AND COALESCE(${alias}.stems_visibility, 'public') <> 'hidden'))`
  );
}
