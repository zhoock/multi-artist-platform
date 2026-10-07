import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import type {
  PlayerTrack,
  PlayerTrackQueueAlbumMeta,
} from '@features/player/model/types/playerSchema';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

function readQueueAlbumMeta(value: unknown): PlayerTrackQueueAlbumMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const albumId = typeof row.albumId === 'string' ? row.albumId.trim() : '';
  if (!albumId) return undefined;

  return {
    albumId,
    album: typeof row.album === 'string' ? row.album : null,
    fullName: typeof row.fullName === 'string' ? row.fullName : null,
    cover: typeof row.cover === 'string' ? row.cover : row.cover === null ? null : null,
    userId: typeof row.userId === 'string' ? row.userId : row.userId === null ? null : null,
  };
}

function readLyricsBundle(value: unknown): TrackLyricsBundle | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const bundle = value as TrackLyricsBundle;
  if (bundle.state !== 'synced' && bundle.state !== 'text-only' && bundle.state !== 'empty') {
    return undefined;
  }
  if (typeof bundle.content !== 'string' || typeof bundle.trackId !== 'string') return undefined;
  return bundle;
}

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

  const lyrics = readLyricsBundle(row.lyrics);
  const content = typeof row.content === 'string' ? row.content : lyrics?.content;
  const authorship =
    typeof row.authorship === 'string'
      ? row.authorship
      : typeof lyrics?.authorship === 'string'
        ? lyrics.authorship
        : undefined;

  const queueAlbumMeta = readQueueAlbumMeta(row.queueAlbumMeta);

  return {
    id,
    albumId: resolvedAlbumId,
    title,
    duration,
    src,
    playbackLocked: Boolean(row.playbackLocked),
    ...(normalizedVisibility ? { visibility: normalizedVisibility } : {}),
    ...(queueAlbumMeta ? { queueAlbumMeta } : {}),
    ...(lyrics ? { lyrics } : {}),
    ...(content ? { content } : {}),
    ...(authorship ? { authorship } : {}),
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
