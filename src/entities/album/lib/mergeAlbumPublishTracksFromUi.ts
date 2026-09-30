import type { AlbumEditable } from '@models';

import type { AlbumData } from './transformEditableAlbumData';

/**
 * Dashboard publish readiness uses Redux album rows; track rows in the expanded
 * album list come from the same fetch but can be ahead while a refetch is in flight.
 * Merge UI track processing fields so publish hints match visible track badges.
 */
export function mergeAlbumPublishTracksFromUi(
  albumFromStore: AlbumEditable,
  uiAlbum: AlbumData
): AlbumEditable {
  const uiById = new Map(uiAlbum.tracks.map((track) => [track.id, track]));

  return {
    ...albumFromStore,
    tracks: (albumFromStore.tracks ?? []).map((track) => {
      const uiTrack = uiById.get(String(track.id));
      if (!uiTrack) {
        return track;
      }

      return {
        ...track,
        ...(uiTrack.processingStatus ? { processingStatus: uiTrack.processingStatus } : {}),
        ...(uiTrack.processingError !== undefined
          ? { processingError: uiTrack.processingError }
          : {}),
        ...(uiTrack.src?.trim() ? { src: uiTrack.src } : {}),
      };
    }),
  };
}
