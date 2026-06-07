// src/pages/StemsPlayground/lib/useMixerNavigation.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MixerAlbum, MixerTrack, MixerView } from './types';

export type MixerNavigation = {
  view: MixerView;
  selectedAlbum: MixerAlbum | null;
  selectedTrack: MixerTrack | null;
  selectAlbum: (albumId: string) => void;
  selectTrack: (trackId: string) => void;
  backToAlbums: () => void;
  backToTracks: () => void;
};

/**
 * Управляет уровнем навигации публичного микшера (albums → tracks → mixer).
 * Сбрасывается на уровень альбомов, если текущий выбор пропал из каталога
 * (например, при смене артиста).
 */
export function useMixerNavigation(albums: MixerAlbum[]): MixerNavigation {
  const [view, setView] = useState<MixerView>('albums');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const selectedAlbum = useMemo(
    () => albums.find((a) => a.albumId === selectedAlbumId) ?? null,
    [albums, selectedAlbumId]
  );

  const selectedTrack = useMemo(
    () => selectedAlbum?.tracks.find((t) => t.id === selectedTrackId) ?? null,
    [selectedAlbum, selectedTrackId]
  );

  // Каталог изменился и текущий выбор стал невалидным — возвращаемся на уровень выше.
  useEffect(() => {
    if (view !== 'albums' && !selectedAlbum) {
      setView('albums');
      setSelectedAlbumId(null);
      setSelectedTrackId(null);
      return;
    }
    if (view === 'mixer' && !selectedTrack) {
      setView('tracks');
      setSelectedTrackId(null);
    }
  }, [view, selectedAlbum, selectedTrack]);

  const selectAlbum = useCallback((albumId: string) => {
    setSelectedAlbumId(albumId);
    setSelectedTrackId(null);
    setView('tracks');
  }, []);

  const selectTrack = useCallback((trackId: string) => {
    setSelectedTrackId(trackId);
    setView('mixer');
  }, []);

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
    backToAlbums,
    backToTracks,
  };
}
