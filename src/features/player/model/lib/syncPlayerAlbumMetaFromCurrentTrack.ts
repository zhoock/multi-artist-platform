import type {
  PlayerAlbumMeta,
  PlayerState,
  PlayerTrackQueueAlbumMeta,
} from '@features/player/model/types/playerSchema';

import {
  normalizePlayerAlbumMeta,
  normalizeQueueAlbumMeta,
  resolvePlayerCoverImg,
} from './normalizePlayerAlbumMeta';

function mergeQueueAlbumMeta(
  base: PlayerAlbumMeta | null,
  embedded: PlayerTrackQueueAlbumMeta
): PlayerAlbumMeta {
  const queueMeta = normalizeQueueAlbumMeta(embedded);
  const albumTitle = queueMeta.album ?? base?.album ?? null;
  const artist = base?.artist ?? null;
  const fullName =
    queueMeta.fullName?.trim() ||
    (artist && albumTitle ? `${artist} — ${albumTitle}` : base?.fullName?.trim() || albumTitle);

  const embeddedImg = resolvePlayerCoverImg(queueMeta.cover);
  const baseImg = resolvePlayerCoverImg(base?.cover);

  return normalizePlayerAlbumMeta({
    albumId: queueMeta.albumId ?? base?.albumId ?? null,
    userId: queueMeta.userId ?? base?.userId ?? null,
    publicSlug: base?.publicSlug ?? null,
    artist,
    album: albumTitle,
    fullName: fullName || null,
    cover: embeddedImg ?? baseImg ?? null,
    playerBackground: queueMeta.playerBackground ?? base?.playerBackground,
  });
}

/**
 * Copies per-track queue album fields into player.albumMeta when the current track carries them.
 * Artist / publicSlug on albumMeta are preserved.
 */
export function syncPlayerAlbumMetaFromCurrentTrack(state: PlayerState): void {
  const track = state.playlist[state.currentTrackIndex];
  const embedded = track?.queueAlbumMeta;
  if (!embedded) return;

  state.albumMeta = mergeQueueAlbumMeta(state.albumMeta, embedded);

  const albumId = state.albumMeta.albumId?.trim();
  const albumTitle = state.albumMeta.album?.trim();
  if (albumId) state.albumId = albumId;
  if (albumTitle) state.albumTitle = albumTitle;
}
