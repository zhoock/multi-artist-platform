/**
 * Universe "Play Artist": thin catalog + mid-weight AlbumDetails.
 * Bootstrap: parallel album details in flight, playback after first playable in catalog order.
 */

import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import type { SupportedLang } from '@shared/model/lang';
import { fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';
import { resolveAlbumDetailsForPlayback } from '@entities/album/lib/resolveAlbumDetailsDisplay';
import { normalizeCatalogAlbum, type CatalogAlbum } from '@entities/album/model/catalogAlbum';
import type { AlbumDetails } from '@entities/album/model/albumDetails';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import {
  appendAlbumsToArtistPlayQueue,
  buildArtistPlayQueue,
  type ArtistPlayQueueResult,
} from './buildArtistPlayQueue';
import { artistPlayTrace } from './artistPlayTrace';

export type FetchUniverseArtistPlayQueueOptions = {
  signal?: AbortSignal;
};

export type ArtistPlayQueueBootstrap = ArtistPlayQueueResult & {
  /** Index in visible catalog after which tail albums begin (exclusive). */
  tailStartIndex: number;
  visibleAlbums: CatalogAlbum[];
  /** Prefetch slots (filled as parallel detail requests complete). */
  resolvedAlbums: (AlbumDetails | null)[];
  /** Resolves when every visible album detail request has settled. */
  detailsInflight: Promise<void>;
};

async function fetchArtistCatalog(
  artistSlug: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  artistPlayTrace('network.catalog.start', { artistSlug });
  const t0 = performance.now();

  const response = await fetchWithAuthSession(
    `/api/artists/${encodeURIComponent(artistSlug)}/albums`,
    {
      signal,
      cache: 'no-store',
      headers,
    }
  );

  if (!response.ok) {
    artistPlayTrace('network.catalog.error', { status: response.status });
    return [];
  }

  const payload = (await response.json()) as { success?: boolean; data?: unknown };
  if (!payload.success || !Array.isArray(payload.data)) return [];

  const rows = payload.data
    .map((row) => normalizeCatalogAlbum(row))
    .filter((row): row is CatalogAlbum => row !== null);

  artistPlayTrace('network.catalog.done', {
    ms: Math.round(performance.now() - t0),
    albumCount: rows.length,
  });

  return rows;
}

async function fetchResolvedAlbumDetails(
  artistSlug: string,
  albumId: string,
  lang: SupportedLang,
  signal?: AbortSignal
): Promise<AlbumDetails | null> {
  const t0 = performance.now();
  artistPlayTrace('network.albumDetails.start', { albumId });
  try {
    const details = await fetchAlbumDetails(artistSlug, albumId, {
      signal,
      playbackBootstrap: true,
    });
    const tFetch = performance.now();
    const resolved = resolveAlbumDetailsForPlayback(details, lang);
    const tResolve = performance.now();
    artistPlayTrace('network.albumDetails.done', {
      albumId,
      fetchMs: Math.round(tFetch - t0),
      resolveMs: Math.round(tResolve - tFetch),
      trackCount: resolved.tracks.length,
    });
    return resolved.tracks.length ? resolved : null;
  } catch {
    artistPlayTrace('network.albumDetails.error', {
      albumId,
      ms: Math.round(performance.now() - t0),
    });
    return null;
  }
}

function filterVisibleCatalog(catalog: CatalogAlbum[]): CatalogAlbum[] {
  return filterCatalogAlbumsForArtistPageSurface(catalog, false).filter(
    (album) => album.trackCount > 0
  );
}

/** Append tail albums from prefetch cache (no network). */
export function appendTailFromResolvedAlbums(
  bootstrap: Pick<ArtistPlayQueueBootstrap, 'visibleAlbums' | 'tailStartIndex' | 'resolvedAlbums'>,
  existingPlaylist: PlayerTrack[]
): PlayerTrack[] {
  const albums = bootstrap.resolvedAlbums
    .slice(bootstrap.tailStartIndex)
    .filter((album): album is AlbumDetails => album != null);
  return appendAlbumsToArtistPlayQueue(existingPlaylist, albums);
}

/**
 * First playable album in catalog order.
 * Fetches album details one-by-one until playable; only then prefetches tail albums (parallel).
 * Avoids blocking first playback on N parallel detail requests + heavy display resolution.
 */
export async function fetchUniverseArtistPlayQueueBootstrap(
  artistSlug: string,
  lang: SupportedLang,
  options: FetchUniverseArtistPlayQueueOptions = {}
): Promise<ArtistPlayQueueBootstrap | null> {
  const slug = artistSlug.trim();
  if (!slug) return null;

  const catalog = await fetchArtistCatalog(slug, options.signal);
  const visibleAlbums = filterVisibleCatalog(catalog);
  if (!visibleAlbums.length) return null;

  const n = visibleAlbums.length;
  const resolvedAlbums: (AlbumDetails | null | undefined)[] = new Array(n);
  const slotInflight: Array<Promise<void> | undefined> = new Array(n);

  const ensureSlotFetch = (index: number): Promise<void> => {
    const existing = slotInflight[index];
    if (existing) return existing;

    const row = visibleAlbums[index];
    slotInflight[index] = fetchResolvedAlbumDetails(slug, row.albumId, lang, options.signal)
      .then((resolved) => {
        resolvedAlbums[index] = resolved;
      })
      .catch(() => {
        resolvedAlbums[index] = null;
      });

    return slotInflight[index]!;
  };

  const prefetchSlotsFrom = (from: number): void => {
    for (let j = from; j < n; j++) {
      void ensureSlotFetch(j);
    }
  };

  const tailDetailsInflight = (fromIndex: number): Promise<void> => {
    if (fromIndex >= n) return Promise.resolve();
    prefetchSlotsFrom(fromIndex);
    return Promise.all(
      Array.from({ length: n - fromIndex }, (_, offset) => ensureSlotFetch(fromIndex + offset))
    ).then(() => undefined);
  };

  /** Start tail prefetch on next macrotask so first playback is not blocked. */
  const scheduleTailDetailsInflight = (fromIndex: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(() => {
        void tailDetailsInflight(fromIndex).then(() => resolve());
      }, 0);
    });

  for (let i = 0; i < n; i++) {
    if (i > 0) prefetchSlotsFrom(i);
    artistPlayTrace('bootstrap.awaitAlbumSlot', { index: i, albumId: visibleAlbums[i].albumId });
    const slotWaitStart = performance.now();
    await ensureSlotFetch(i);
    artistPlayTrace('bootstrap.albumSlotReady', {
      index: i,
      albumId: visibleAlbums[i].albumId,
      ms: Math.round(performance.now() - slotWaitStart),
    });

    const resolved = resolvedAlbums[i] ?? null;
    if (!resolved) continue;

    const tBuild = performance.now();
    const built = buildArtistPlayQueue([resolved]);
    artistPlayTrace('buildArtistPlayQueue.bootstrap', {
      albumId: visibleAlbums[i].albumId,
      index: i,
      ms: Math.round(performance.now() - tBuild),
      playable: Boolean(built),
    });

    if (!built) continue;

    const detailsInflight = scheduleTailDetailsInflight(i + 1);

    return {
      ...built,
      tailStartIndex: i + 1,
      visibleAlbums,
      /** Same array mutated by tail prefetch — do not snapshot-copy here. */
      resolvedAlbums: resolvedAlbums as (AlbumDetails | null)[],
      detailsInflight,
    };
  }

  await tailDetailsInflight(0);
  return null;
}

/**
 * Remaining albums after bootstrap — uses prefetch cache when available.
 */
export async function fetchUniverseArtistPlayQueueTail(
  artistSlug: string,
  lang: SupportedLang,
  bootstrap: Pick<
    ArtistPlayQueueBootstrap,
    'visibleAlbums' | 'tailStartIndex' | 'resolvedAlbums' | 'detailsInflight'
  >,
  existingPlaylist: PlayerTrack[],
  options: FetchUniverseArtistPlayQueueOptions = {}
): Promise<PlayerTrack[]> {
  if (bootstrap.tailStartIndex >= bootstrap.visibleAlbums.length) {
    return existingPlaylist;
  }

  if (bootstrap.detailsInflight) {
    artistPlayTrace('tail.awaitPrefetch.start');
    const t0 = performance.now();
    await bootstrap.detailsInflight;
    artistPlayTrace('tail.awaitPrefetch.done', { ms: Math.round(performance.now() - t0) });
    return appendTailFromResolvedAlbums(bootstrap, existingPlaylist);
  }

  const slug = artistSlug.trim();
  if (!slug) return existingPlaylist;

  const tailRows = bootstrap.visibleAlbums.slice(bootstrap.tailStartIndex);
  const resolvedList = await Promise.all(
    tailRows.map((row) => fetchResolvedAlbumDetails(slug, row.albumId, lang, options.signal))
  );

  const albums = resolvedList.filter((album): album is AlbumDetails => album !== null);
  return appendAlbumsToArtistPlayQueue(existingPlaylist, albums);
}

/**
 * Full queue (uses bootstrap + cached tail when possible).
 */
export async function fetchUniverseArtistPlayQueue(
  artistSlug: string,
  lang: SupportedLang,
  options: FetchUniverseArtistPlayQueueOptions = {}
): Promise<ArtistPlayQueueResult | null> {
  const bootstrap = await fetchUniverseArtistPlayQueueBootstrap(artistSlug, lang, options);
  if (!bootstrap) return null;

  if (bootstrap.tailStartIndex >= bootstrap.visibleAlbums.length) {
    return { firstAlbum: bootstrap.firstAlbum, playlist: bootstrap.playlist };
  }

  const playlist = await fetchUniverseArtistPlayQueueTail(
    artistSlug,
    lang,
    bootstrap,
    bootstrap.playlist,
    options
  );

  return { firstAlbum: bootstrap.firstAlbum, playlist };
}
