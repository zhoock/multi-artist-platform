import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';

export function resolvePlayerTrackAlbumId(track: PlayerTrack): string {
  return (track.albumId ?? track.queueAlbumMeta?.albumId ?? '').trim();
}

export function playerTrackMatchesStemScope(
  track: PlayerTrack,
  albumId: string,
  trackId: string
): boolean {
  const normalizedTrackId = normalizeTrackIdString(trackId);
  if (normalizeTrackIdString(track.id) !== normalizedTrackId) return false;

  const normalizedAlbumId = albumId.trim();
  if (!normalizedAlbumId) return false;

  const trackAlbumId = resolvePlayerTrackAlbumId(track);
  if (!trackAlbumId) return true;
  return trackAlbumId === normalizedAlbumId;
}

export function applyHasStemsToPlayerTrack(track: PlayerTrack, hasStems: boolean): PlayerTrack {
  if (hasStems) {
    if (track.hasStems === true) return track;
    return { ...track, hasStems: true };
  }
  if (track.hasStems !== true) return track;
  const { hasStems: _removed, ...rest } = track;
  return rest;
}

export function patchPlayerTrackListHasStems(
  list: PlayerTrack[],
  albumId: string,
  trackId: string,
  hasStems: boolean
): { next: PlayerTrack[]; changed: boolean } {
  let changed = false;
  const next = list.map((track) => {
    if (!playerTrackMatchesStemScope(track, albumId, trackId)) return track;
    const patched = applyHasStemsToPlayerTrack(track, hasStems);
    if (patched !== track) changed = true;
    return patched;
  });
  return { next: changed ? next : list, changed };
}
