// src/pages/StemsPlayground/lib/useMixerNavigation.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MixerAlbum, MixerTrack, MixerView } from './types';
import { pickMixerAlbumForSelection } from './findMixerAlbumByRouteId';
import type { MixerTrackDeepLinkTarget } from './readMixerTrackDeepLink';

export type MixerNavigationOptions = {
  trackDeepLink?: MixerTrackDeepLinkTarget | null;
};

export type MixerNavigation = {
  view: MixerView;
  selectedAlbum: MixerAlbum | null;
  selectedTrack: MixerTrack | null;
  selectAlbum: (albumId: string) => void;
  selectTrack: (trackId: string) => void;
  openAlbumTrack: (albumId: string, trackId: string, hydratedAlbum?: MixerAlbum | null) => boolean;
  backToAlbums: () => void;
  backToTracks: () => void;
};

function initialStateForDeepLink(trackDeepLink: MixerTrackDeepLinkTarget | null | undefined): {
  view: MixerView;
  selectedAlbumId: string | null;
  selectedTrackId: string | null;
} {
  if (!trackDeepLink) {
    return { view: 'albums', selectedAlbumId: null, selectedTrackId: null };
  }
  return {
    view: 'mixer',
    selectedAlbumId: trackDeepLink.albumId,
    selectedTrackId: trackDeepLink.trackId,
  };
}

/**
 * Управляет уровнем навигации публичного микшера (albums → tracks → mixer).
 * Сбрасывается на уровень альбомов, если текущий выбор пропал из каталога
 * (например, при смене артиста).
 */
export function useMixerNavigation(
  albums: MixerAlbum[],
  options?: MixerNavigationOptions
): MixerNavigation {
  const trackDeepLink = options?.trackDeepLink ?? null;
  const trackDeepLinkKey = trackDeepLink ? `${trackDeepLink.albumId}:${trackDeepLink.trackId}` : '';

  const [view, setView] = useState<MixerView>(() => initialStateForDeepLink(trackDeepLink).view);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(
    () => initialStateForDeepLink(trackDeepLink).selectedAlbumId
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    () => initialStateForDeepLink(trackDeepLink).selectedTrackId
  );
  const albumsRef = useRef(albums);
  albumsRef.current = albums;

  // Re-apply deep-link target only when URL target changes, not when parent clears deep link for browse mode.
  useEffect(() => {
    if (!trackDeepLink) return;
    const next = initialStateForDeepLink(trackDeepLink);
    setView(next.view);
    setSelectedAlbumId(next.selectedAlbumId);
    setSelectedTrackId(next.selectedTrackId);
  }, [trackDeepLinkKey, trackDeepLink]);

  const selectedAlbum = useMemo(
    () => pickMixerAlbumForSelection(albums, selectedAlbumId),
    [albums, selectedAlbumId]
  );

  const selectedTrack = useMemo(
    () => selectedAlbum?.tracks.find((t) => t.id === selectedTrackId) ?? null,
    [selectedAlbum, selectedTrackId]
  );

  // Каталог изменился и текущий выбор стал невалидным — возвращаемся на уровень выше.
  useEffect(() => {
    if (view !== 'albums' && !selectedAlbum) {
      if (selectedAlbumId && trackDeepLink) {
        const deepLinkPending =
          trackDeepLink.albumId === selectedAlbumId &&
          (!selectedTrackId || trackDeepLink.trackId === selectedTrackId);
        if (deepLinkPending) {
          return;
        }
      }
      setView('albums');
      setSelectedAlbumId(null);
      setSelectedTrackId(null);
      return;
    }
    if (view === 'mixer' && !selectedTrack) {
      const awaitingSelection =
        Boolean(trackDeepLink) &&
        Boolean(selectedTrackId && selectedAlbumId) &&
        (!selectedAlbum ||
          selectedAlbum.tracksStatus !== 'loaded' ||
          !selectedAlbum.tracks.some((t) => t.id === selectedTrackId));
      if (awaitingSelection) {
        return;
      }
      setView('tracks');
      setSelectedTrackId(null);
    }
  }, [view, selectedAlbum, selectedTrack, selectedTrackId, selectedAlbumId, trackDeepLink]);

  const selectAlbum = useCallback((albumId: string) => {
    setSelectedAlbumId(albumId);
    setSelectedTrackId(null);
    setView('tracks');
  }, []);

  const selectTrack = useCallback(
    (trackId: string) => {
      const album = albums.find((a) => a.albumId === selectedAlbumId);
      const track = album?.tracks.find((t) => t.id === trackId);
      if (track?.locked) return;
      setSelectedTrackId(trackId);
      setView('mixer');
    },
    [albums, selectedAlbumId]
  );

  const openAlbumTrack = useCallback(
    (albumId: string, trackId: string, hydratedAlbum?: MixerAlbum | null): boolean => {
      const album =
        hydratedAlbum ?? albumsRef.current.find((a) => a.albumId === albumId.trim()) ?? null;
      const track = album?.tracks.find((t) => t.id === trackId.trim());
      if (!album || !track || track.locked) return false;
      setSelectedAlbumId(album.albumId);
      setSelectedTrackId(track.id);
      setView('mixer');
      return true;
    },
    []
  );

  const backToAlbums = useCallback(() => {
    setView('albums');
    setSelectedAlbumId(null);
    setSelectedTrackId(null);
  }, []);

  const backToTracks = useCallback(() => {
    setView('tracks');
    setSelectedTrackId(null);
  }, []);

  return {
    view,
    selectedAlbum,
    selectedTrack,
    selectAlbum,
    selectTrack,
    openAlbumTrack,
    backToAlbums,
    backToTracks,
  };
}
