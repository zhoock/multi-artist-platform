import type { AlbumEditable } from '@models';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

export function patchAlbumsWithTrackLyrics(
  albums: AlbumEditable[],
  bundle: TrackLyricsBundle
): AlbumEditable[] {
  return albums.map((album) => {
    const albumKey = album.albumId ?? '';
    if (albumKey !== bundle.albumId) {
      return album;
    }
    return {
      ...album,
      tracks: (album.tracks ?? []).map((track) => {
        if (String(track.id) !== String(bundle.trackId)) {
          return track;
        }
        return {
          ...track,
          content: bundle.content,
          authorship: bundle.authorship ?? track.authorship,
          lyrics: bundle,
        };
      }),
    };
  });
}
