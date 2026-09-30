import { useEffect } from 'react';

import { fetchDashboardAlbums } from '@entities/album/model/albumsSlice';
import { getAlbumPublishHintKey } from '@entities/album/lib/isAlbumReadyToPublish';
import { mergeAlbumPublishTracksFromUi } from '@entities/album/lib/mergeAlbumPublishTracksFromUi';
import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';
import type { AlbumEditable } from '@models';
import type { AppDispatch } from '@shared/model/appStore/types';
import { albumHasTracksAwaitingPublishPlayability } from '@shared/lib/tracks/trackPublishReadiness';

const PROCESSING_POLL_INTERVAL_MS = 5_000;

export function dashboardAlbumsNeedProcessingRefresh(
  albumsFromStore: AlbumEditable[],
  albumsData: AlbumData[]
): boolean {
  return albumsData.some((uiAlbum) => {
    const storeAlbum = albumsFromStore.find(
      (entry) => entry.albumId === uiAlbum.albumId || entry.albumId === uiAlbum.id
    );

    if (storeAlbum) {
      const merged = mergeAlbumPublishTracksFromUi(storeAlbum, uiAlbum);
      if (getAlbumPublishHintKey(merged) === 'processing') {
        return true;
      }
    }

    return albumHasTracksAwaitingPublishPlayability(
      uiAlbum.tracks.map((track) => ({
        trackId: track.id,
        processingStatus: track.processingStatus,
        src: track.src,
        visibility: track.visibility,
        stemsVisibility: track.stemsVisibility,
      }))
    );
  });
}

/** Refetch dashboard albums while audio processing blocks publish readiness. */
export function useDashboardAlbumProcessingPoll(input: {
  enabled: boolean;
  dispatch: AppDispatch;
  albumsFromStore: AlbumEditable[];
  albumsData: AlbumData[];
}): void {
  const { enabled, dispatch, albumsFromStore, albumsData } = input;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (!dashboardAlbumsNeedProcessingRefresh(albumsFromStore, albumsData)) {
      return undefined;
    }

    const poll = () => {
      if (!dashboardAlbumsNeedProcessingRefresh(albumsFromStore, albumsData)) {
        return;
      }
      void dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true }));
    };

    const intervalId = window.setInterval(poll, PROCESSING_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled, dispatch, albumsFromStore, albumsData]);
}
