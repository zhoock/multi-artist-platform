// src/pages/StemsPlayground/lib/useMixerCatalog.ts
/**
 * Mixer data plane: CatalogAlbum (list, hasStems only) → AlbumDetails (on select) → loadStems.
 * Never uses fat `/api/albums` / AlbumEditable / public albums selectors.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  fetchArtistAlbumCatalog,
  selectArtistAlbumCatalogStatus,
  selectArtistAlbumCatalogCacheIsStale,
  selectArtistAlbumCatalogForSurface,
} from '@entities/album';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';
import { fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';
import { resolveAlbumDetailsForDisplay } from '@entities/album/lib/resolveAlbumDetailsDisplay';
import type { CatalogAlbum } from '@entities/album/model/catalogAlbum';
import type { RequestStatus } from '@entities/album/model/types';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { shouldShowAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { buildMixerTracksFromAlbumDetails } from './buildMixerTracksFromAlbumDetails';
import type { MixerAlbum } from './types';

function yearFromReleaseDate(releaseDate: string): string {
  if (!releaseDate.trim()) return '';
  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.getFullYear().toString();
}

function catalogToMixerAlbumShell(album: CatalogAlbum): MixerAlbum {
  return {
    albumId: album.albumId,
    title: album.title || album.albumId,
    year: yearFromReleaseDate(album.releaseDate),
    cover: album.cover || undefined,
    userId: album.userId || undefined,
    listedTrackCount: album.trackCount,
    tracks: [],
    tracksStatus: 'idle',
  };
}

export type MixerCatalog = {
  /** Album list from thin CatalogAlbum (tracks filled after select). */
  albums: MixerAlbum[];
  /** Thin catalog loading shell. */
  loading: boolean;
  /** Redux thin-catalog request status (for empty-state gating). */
  catalogStatus: RequestStatus;
  /** True while cached catalog belongs to another artist context. */
  catalogCacheStale: boolean;
  /** After catalog settled: whether thin catalog contains any album with stems. */
  catalogHasStemAlbums: boolean | null;
  /** AlbumId whose AlbumDetails + stems are currently loading. */
  tracksLoadingAlbumId: string | null;
  /** Load AlbumDetails + loadStems for one album (idempotent while in flight). */
  loadAlbumTracks: (albumId: string, options?: { force?: boolean }) => Promise<MixerAlbum | null>;
};

/**
 * Builds mixer catalog from thin public catalog; loads mid-weight details per album on demand.
 */
export function useMixerCatalog(): MixerCatalog {
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const publicArtistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const artistSlug = searchParams.get('artist')?.trim() || publicArtistSlugFromStore?.trim() || '';

  const catalogStatus = useAppSelector(selectArtistAlbumCatalogStatus);
  const catalogCacheStale = useAppSelector(selectArtistAlbumCatalogCacheIsStale);
  const publicCatalogAlbums = useAppSelector(selectArtistAlbumCatalogForSurface);

  const [albums, setAlbums] = useState<MixerAlbum[]>([]);
  const [tracksLoadingAlbumId, setTracksLoadingAlbumId] = useState<string | null>(null);

  const langRef = useRef(lang);
  langRef.current = lang;
  const artistSlugRef = useRef(artistSlug);
  artistSlugRef.current = artistSlug;
  const inFlightRef = useRef<Set<string>>(new Set());
  const albumsRef = useRef(albums);
  albumsRef.current = albums;

  const showCatalogLoadingShell = shouldShowAlbumsLoadingShell(
    catalogStatus,
    albums.length > 0,
    catalogCacheStale
  );

  const catalogSettled = catalogStatus === 'succeeded' && !catalogCacheStale;
  const catalogHasStemAlbums = catalogSettled
    ? filterCatalogAlbumsForArtistPageSurface(publicCatalogAlbums, false).some(
        (row) => row.hasStems
      )
    : null;

  // Thin catalog for album list (lang-independent; refetch only on artist change).
  useEffect(() => {
    setAlbums([]);
    dispatch(
      fetchArtistAlbumCatalog({
        force: true,
        publicArtistSlug: artistSlug || null,
      })
    );
  }, [artistSlug, dispatch]);

  // Map CatalogAlbum → MixerAlbum shells (only albums with stems; preserve loaded tracks).
  useEffect(() => {
    if (catalogStatus === 'loading' || catalogStatus === 'idle') return;
    if (catalogStatus === 'failed' || catalogCacheStale) {
      setAlbums([]);
      return;
    }
    if (catalogStatus !== 'succeeded') return;

    const surface = filterCatalogAlbumsForArtistPageSurface(publicCatalogAlbums, false).filter(
      (row) => row.hasStems
    );
    setAlbums((prev) => {
      const prevById = new Map(prev.map((album) => [album.albumId, album]));
      return surface.map((row) => {
        const shell = catalogToMixerAlbumShell(row);
        const existing = prevById.get(row.albumId);
        if (
          existing &&
          (existing.tracksStatus === 'loaded' || existing.tracksStatus === 'loading')
        ) {
          return {
            ...shell,
            tracks: existing.tracks,
            tracksStatus: existing.tracksStatus,
          };
        }
        return shell;
      });
    });
  }, [catalogStatus, catalogCacheStale, publicCatalogAlbums]);

  const loadAlbumTracks = useCallback(
    async (albumId: string, options?: { force?: boolean }): Promise<MixerAlbum | null> => {
      const id = albumId.trim();
      const slug = artistSlugRef.current.trim();
      if (!id || !slug) return null;

      const current = albumsRef.current.find((album) => album.albumId === id);
      if (!options?.force && current?.tracksStatus === 'loaded') {
        return current;
      }
      if (inFlightRef.current.has(id)) {
        return albumsRef.current.find((album) => album.albumId === id) ?? null;
      }

      inFlightRef.current.add(id);
      setTracksLoadingAlbumId(id);
      setAlbums((prev) =>
        prev.map((album) =>
          album.albumId === id ? { ...album, tracksStatus: 'loading' as const } : album
        )
      );

      try {
        const details = await fetchAlbumDetails(slug, id);
        const resolved = resolveAlbumDetailsForDisplay(details, langRef.current);
        const storageUserId = resolved.userId?.trim() || current?.userId?.trim() || '';
        if (!storageUserId) {
          setAlbums((prev) =>
            prev.map((album) =>
              album.albumId === id
                ? { ...album, tracks: [], tracksStatus: 'failed' as const }
                : album
            )
          );
          return null;
        }

        const tracks = await buildMixerTracksFromAlbumDetails(resolved, storageUserId);
        const next: MixerAlbum = {
          albumId: resolved.albumId,
          title: resolved.title || resolved.albumId,
          year: yearFromReleaseDate(
            typeof resolved.release?.date === 'string' ? resolved.release.date : ''
          ),
          cover: resolved.cover || undefined,
          userId: storageUserId,
          listedTrackCount: current?.listedTrackCount ?? resolved.tracks.length,
          tracks,
          tracksStatus: 'loaded',
        };

        setAlbums((prev) => {
          const exists = prev.some((album) => album.albumId === id);
          if (!exists) return [...prev, next];
          return prev.map((album) => (album.albumId === id ? next : album));
        });
        return next;
      } catch {
        setAlbums((prev) =>
          prev.map((album) =>
            album.albumId === id ? { ...album, tracks: [], tracksStatus: 'failed' as const } : album
          )
        );
        return null;
      } finally {
        inFlightRef.current.delete(id);
        setTracksLoadingAlbumId((prev) => (prev === id ? null : prev));
      }
    },
    []
  );

  // Admin stem cover / visibility changes — refresh thin catalog; reload open album tracks.
  useEffect(() => {
    const handleStemCatalogRefresh = () => {
      dispatch(
        fetchArtistAlbumCatalog({
          force: true,
          publicArtistSlug: artistSlugRef.current || null,
        })
      );
      const loadingId = tracksLoadingAlbumId;
      const selectedLoaded = albumsRef.current.find(
        (album) => album.tracksStatus === 'loaded' || album.tracksStatus === 'loading'
      );
      const reloadId = selectedLoaded?.albumId || loadingId;
      if (reloadId) {
        void loadAlbumTracks(reloadId, { force: true });
      }
    };
    window.addEventListener('stem-cover-updated', handleStemCatalogRefresh);
    window.addEventListener('stems-visibility-updated', handleStemCatalogRefresh);
    window.addEventListener('stems-manifest-updated', handleStemCatalogRefresh);
    window.addEventListener('archive:changed', handleStemCatalogRefresh);
    return () => {
      window.removeEventListener('stem-cover-updated', handleStemCatalogRefresh);
      window.removeEventListener('stems-visibility-updated', handleStemCatalogRefresh);
      window.removeEventListener('stems-manifest-updated', handleStemCatalogRefresh);
      window.removeEventListener('archive:changed', handleStemCatalogRefresh);
    };
  }, [dispatch, loadAlbumTracks, tracksLoadingAlbumId]);

  return {
    albums,
    loading: showCatalogLoadingShell,
    catalogStatus,
    catalogCacheStale,
    catalogHasStemAlbums,
    tracksLoadingAlbumId,
    loadAlbumTracks,
  };
}
