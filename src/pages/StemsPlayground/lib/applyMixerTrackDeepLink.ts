import type { MixerAlbum } from './types';

export type MixerTrackDeepLinkOutcome =
  | { kind: 'open_mixer'; albumId: string; trackId: string; hydratedAlbum: MixerAlbum }
  | { kind: 'tracks_list'; albumId: string; requestAccess?: boolean }
  | { kind: 'pending' };

/**
 * Decides deep-link UI after AlbumDetails + mixer tracks finished loading.
 * Returns `pending` while album rows are still loading — caller must not mark URL as handled.
 */
export function resolveMixerTrackDeepLinkOutcome(
  deepLinkAlbumId: string,
  deepLinkTrackId: string,
  loaded: MixerAlbum | null | undefined,
  openAlbumTrack: (albumId: string, trackId: string, hydratedAlbum?: MixerAlbum | null) => boolean
): MixerTrackDeepLinkOutcome {
  if (!loaded || loaded.tracksStatus === 'loading' || loaded.tracksStatus === 'idle') {
    return { kind: 'pending' };
  }

  const albumId = loaded.albumId.trim() || deepLinkAlbumId.trim();
  const trackId = deepLinkTrackId.trim();
  const track = loaded.tracks.find((t) => t.id === trackId);

  if (loaded.tracksStatus === 'failed' || !track) {
    return { kind: 'tracks_list', albumId };
  }

  if (track.locked) {
    return { kind: 'tracks_list', albumId, requestAccess: true };
  }

  if (openAlbumTrack(albumId, trackId, loaded)) {
    return { kind: 'open_mixer', albumId, trackId, hydratedAlbum: loaded };
  }

  return { kind: 'tracks_list', albumId };
}
