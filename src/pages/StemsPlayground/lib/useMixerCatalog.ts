// src/pages/StemsPlayground/lib/useMixerCatalog.ts
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { IAlbums } from '@models';
import { getUserAudioUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { fetchAlbums } from '@entities/album/model/albumsSlice';
import {
  selectAlbumsStatus,
  selectPublicAlbumsDataResolvedForSurface,
} from '@entities/album/model/selectors';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { useShowSurfaceAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { loadStems, getStemAudioUrl } from '@entities/stem';
import { isTrackPlaybackBlocked } from '@shared/lib/tracks/trackPlayback';
import type { MixerAlbum, MixerTrack, PlayableStem } from './types';

/** Год релиза из `album.release.date` (пустая строка, если нет). */
function resolveAlbumYear(album: IAlbums): string {
  const release = album.release;
  if (release && typeof release === 'object' && 'date' in release) {
    const raw = (release as Record<string, unknown>).date;
    const dateStr = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.getFullYear().toString();
      }
    }
  }
  return '';
}

export type MixerCatalog = {
  /** Альбомы, у которых есть хотя бы один трек со стемами. */
  albums: MixerAlbum[];
  /** Идёт построение каталога (включая скелетон загрузки альбомов). */
  loading: boolean;
};

/**
 * Строит каталог альбомов и треков, у которых есть стемы в Storage.
 * Перезапускается при смене артиста/языка; пустые альбомы и треки отфильтрованы.
 */
export function useMixerCatalog(): MixerCatalog {
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const publicArtistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const artistSlug = searchParams.get('artist')?.trim() || publicArtistSlugFromStore?.trim() || '';
  const albums = useAppSelector(selectPublicAlbumsDataResolvedForSurface);
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsLastUpdated = useAppSelector((s) => s.albums.lastUpdated);
  const showAlbumsLoadingShell = useShowSurfaceAlbumsLoadingShell(albumsStatus, albums.length > 0);

  /** Метка момента смены артиста/языка: не строим список из устаревшего кэша. */
  const syncEpochRef = useRef(0);

  const [catalog, setCatalog] = useState<MixerAlbum[]>([]);
  const [building, setBuilding] = useState(true);

  // Смена артиста/языка: очищаем каталог, запрашиваем свежие альбомы.
  useEffect(() => {
    syncEpochRef.current = Date.now();
    setCatalog([]);
    setBuilding(true);
    dispatch(
      fetchAlbums({
        force: true,
        forcePublicCatalog: true,
        publicArtistSlug: artistSlug || null,
      })
    );
  }, [artistSlug, dispatch, lang]);

  // Превью обложек стемов из админки: принудительно перечитываем альбомы.
  useEffect(() => {
    const handleStemCoverUpdate = () => {
      dispatch(
        fetchAlbums({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: artistSlug || null,
        })
      );
    };
    window.addEventListener('stem-cover-updated', handleStemCoverUpdate);
    return () => window.removeEventListener('stem-cover-updated', handleStemCoverUpdate);
  }, [artistSlug, dispatch]);

  // Построение каталога только после актуального fetchAlbums для текущего артиста.
  useEffect(() => {
    if (albumsStatus === 'loading' || albumsStatus === 'idle') {
      return;
    }

    if (albumsStatus === 'failed') {
      setCatalog([]);
      setBuilding(false);
      return;
    }

    if (albumsStatus !== 'succeeded') {
      setBuilding(false);
      return;
    }

    if (albumsLastUpdated != null && albumsLastUpdated < syncEpochRef.current) {
      return;
    }

    if (!albums || albums.length === 0) {
      setCatalog([]);
      setBuilding(false);
      return;
    }

    const syncAtLoadStart = syncEpochRef.current;

    const build = async () => {
      setBuilding(true);
      const result: MixerAlbum[] = [];

      for (const album of albums) {
        if (!album.albumId || !album.tracks || album.tracks.length === 0) continue;

        const storageUserId = album.userId ? String(album.userId).trim() : '';
        if (!storageUserId) continue;

        const mixerTracks: MixerTrack[] = [];

        for (const track of album.tracks) {
          const trackId = String(track.id);
          const albumId = album.albumId;

          const {
            stems: stemMetas,
            accessToken,
            accessTokenExpiresAt,
            accessDenied,
          } = await loadStems(storageUserId, albumId, trackId);

          const trackTitle = track.title || `Track ${trackId}`;
          const trackDuration = typeof track.duration === 'number' ? track.duration : 0;

          if (accessDenied && isTrackPlaybackBlocked(track)) {
            mixerTracks.push({
              id: trackId,
              title: trackTitle,
              duration: trackDuration,
              locked: true,
              stems: [],
            });
            continue;
          }

          if (!stemMetas || stemMetas.length === 0) continue;

          const stems: PlayableStem[] = [];
          for (const meta of stemMetas) {
            const url = getStemAudioUrl(
              storageUserId,
              albumId,
              trackId,
              meta,
              accessToken,
              accessTokenExpiresAt
            );
            if (url) {
              stems.push({ id: meta.id, name: meta.name, category: meta.category, url });
            }
          }
          if (stems.length === 0) continue;

          const mixUrl = track.src
            ? optionalMediaSrc(
                getUserAudioUrl(track.src, true, storageUserId),
                'useMixerCatalog:mix',
                { albumId, trackId }
              )
            : undefined;

          mixerTracks.push({
            id: trackId,
            title: trackTitle,
            duration: trackDuration,
            mixUrl: mixUrl ?? undefined,
            stems,
          });
        }

        if (mixerTracks.length > 0) {
          result.push({
            albumId: album.albumId,
            title: album.album || album.albumId,
            year: resolveAlbumYear(album),
            cover: album.cover,
            userId: storageUserId,
            tracks: mixerTracks,
          });
        }
      }

      if (syncAtLoadStart !== syncEpochRef.current) {
        return;
      }

      setCatalog(result);
      setBuilding(false);
    };

    build();
  }, [albums, albumsStatus, albumsLastUpdated, artistSlug]);

  return {
    albums: catalog,
    loading: showAlbumsLoadingShell || building,
  };
}
