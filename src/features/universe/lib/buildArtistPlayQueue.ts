/**
 * Build a single cross-album player queue for "Play artist" (Universe / artist card).
 */

import { getUserAudioUrl } from '@shared/api/albums';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import { isTrackPlaybackBlocked } from '@shared/lib/tracks/trackPlayback';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { toPlayerTracks } from '@features/player/model/lib/toPlayerTrack';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import type { AlbumDetails, TrackDetails } from '@entities/album/model/albumDetails';

export type ArtistPlayQueueResult = {
  /** First catalog album that contributed at least one queue track. */
  firstAlbum: AlbumDetails;
  playlist: PlayerTrack[];
};

function transformTrackSrcForQueue(track: TrackDetails, albumUserId?: string): TrackDetails {
  return {
    ...track,
    src: emptyStringMediaSrc(
      getUserAudioUrl(track.src, undefined, albumUserId),
      'buildArtistPlayQueue',
      { trackId: track.id, albumUserId }
    ),
  };
}

/** Visible, playable tracks for one album — locale rows deduped by logical track id. */
export function listAlbumTracksForArtistPlayQueue(tracks: TrackDetails[]): TrackDetails[] {
  const out: TrackDetails[] = [];
  const seenInAlbum = new Set<string>();

  for (const track of tracks) {
    if (normalizeTrackVisibility(track.visibility) === 'hidden') continue;
    const id = normalizeTrackIdString(track.id);
    if (!id || seenInAlbum.has(id)) continue;
    seenInAlbum.add(id);
    if (isTrackPlaybackBlocked(track)) continue;
    out.push(track);
  }

  return out;
}

/**
 * Flatten albums in order into one player queue. Skips albums with no playable tracks.
 * The same logical track id never appears twice (locale merge / cross-album safety).
 */
export function buildArtistPlayQueue(albums: AlbumDetails[]): ArtistPlayQueueResult | null {
  const globalSeen = new Set<string>();
  const queueRows: Array<
    TrackDetails & { albumId: string; queueAlbumMeta: PlayerTrack['queueAlbumMeta'] }
  > = [];
  let firstAlbum: AlbumDetails | null = null;

  for (const album of albums) {
    const albumClientId = fallbackAlbumClientId(album);
    const candidates = listAlbumTracksForArtistPlayQueue(album.tracks ?? []);
    if (!candidates.length) continue;
    if (!firstAlbum) firstAlbum = album;

    for (const track of candidates) {
      const id = normalizeTrackIdString(track.id);
      if (!id || globalSeen.has(id)) continue;
      globalSeen.add(id);

      const withSrc = transformTrackSrcForQueue(track, album.userId);
      queueRows.push({
        ...withSrc,
        albumId: albumClientId,
        queueAlbumMeta: {
          albumId: albumClientId,
          album: album.title,
          cover: album.cover ?? null,
          userId: album.userId ?? null,
          fullName: null,
        },
      });
    }
  }

  if (!firstAlbum || !queueRows.length) return null;

  const playlist = toPlayerTracks(queueRows);
  if (!playlist.length) return null;

  return { firstAlbum, playlist };
}

/** Append later albums without duplicating logical track ids already in the queue. */
export function appendAlbumsToArtistPlayQueue(
  existingPlaylist: PlayerTrack[],
  albums: AlbumDetails[]
): PlayerTrack[] {
  const globalSeen = new Set(
    existingPlaylist.map((track) => normalizeTrackIdString(track.id)).filter(Boolean)
  );
  const queueRows: Array<
    TrackDetails & { albumId: string; queueAlbumMeta: PlayerTrack['queueAlbumMeta'] }
  > = [];

  for (const album of albums) {
    const albumClientId = fallbackAlbumClientId(album);
    const candidates = listAlbumTracksForArtistPlayQueue(album.tracks ?? []);
    for (const track of candidates) {
      const id = normalizeTrackIdString(track.id);
      if (!id || globalSeen.has(id)) continue;
      globalSeen.add(id);

      const withSrc = transformTrackSrcForQueue(track, album.userId);
      queueRows.push({
        ...withSrc,
        albumId: albumClientId,
        queueAlbumMeta: {
          albumId: albumClientId,
          album: album.title,
          cover: album.cover ?? null,
          userId: album.userId ?? null,
          fullName: null,
        },
      });
    }
  }

  if (!queueRows.length) return existingPlaylist;
  return [...existingPlaylist, ...toPlayerTracks(queueRows)];
}
