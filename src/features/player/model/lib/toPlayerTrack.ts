import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';

/**
 * Strip a fat TracksProps (or legacy persisted row) down to PlayerTrack fields only.
 * Safe to call repeatedly — already-thin tracks pass through.
 */
export function toPlayerTrack(track: unknown, albumId?: string | null): PlayerTrack | null {
  if (!track || typeof track !== 'object') return null;

  const row = track as Record<string, unknown>;
  const rawId =
    typeof row.id === 'string' ? row.id : typeof row.trackId === 'string' ? row.trackId : '';
  const id = normalizeTrackIdString(rawId);
  if (!id) return null;

  const title = typeof row.title === 'string' ? row.title : '';
  const src = typeof row.src === 'string' ? row.src : '';
  const duration =
    typeof row.duration === 'number' && Number.isFinite(row.duration) ? row.duration : 0;

  const trackAlbumId = typeof row.albumId === 'string' ? row.albumId.trim() : '';
  const resolvedAlbumId =
    trackAlbumId || (typeof albumId === 'string' && albumId.trim()) || undefined;

  const visibility = row.visibility;
  const normalizedVisibility =
    visibility === 'public' || visibility === 'subscribers_only' || visibility === 'hidden'
      ? visibility
      : undefined;

  return {
    id,
    albumId: resolvedAlbumId,
    title,
    duration,
    src,
    playbackLocked: Boolean(row.playbackLocked),
    ...(normalizedVisibility ? { visibility: normalizedVisibility } : {}),
  };
}

export function toPlayerTracks(
  tracks: readonly unknown[] | null | undefined,
  albumId?: string | null
): PlayerTrack[] {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .map((track) => toPlayerTrack(track, albumId))
    .filter((track): track is PlayerTrack => track !== null);
}
