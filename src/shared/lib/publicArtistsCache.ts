import type { SceneArtist } from '@components/view/universe3dTypes';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

let artistsBySlug = new Map<string, SceneArtist>();
let inflight: Promise<SceneArtist[]> | null = null;

function indexArtists(artists: SceneArtist[]): SceneArtist[] {
  artistsBySlug = new Map(
    artists
      .filter((artist) => artist.publicSlug?.trim())
      .map((artist) => [artist.publicSlug.trim().toLowerCase(), artist])
  );
  return artists;
}

export function getPublicArtistDisplayName(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (!key) return '';
  return artistsBySlug.get(key)?.name?.trim() ?? '';
}

/** Sync read of headerImages from loader prefetch — before /api/user-profile resolves. */
export function getCachedPublicArtistHeaderImages(slug: string): string[] | null {
  const key = slug.trim().toLowerCase();
  if (!key || artistsBySlug.size === 0) return null;
  const images = artistsBySlug.get(key)?.headerImages;
  if (!images?.length) return null;
  return images;
}

/** Apply Dashboard hero save to the in-memory public-artists index. */
export function patchCachedPublicArtistHeaderImages(
  artistSlug: string,
  headerImages: string[]
): void {
  const key = artistSlug.trim().toLowerCase();
  if (!key) return;
  const artist = artistsBySlug.get(key);
  if (!artist) return;
  artistsBySlug.set(key, { ...artist, headerImages: [...headerImages] });
}

async function fetchPublicArtistsFromNetwork(): Promise<SceneArtist[]> {
  const response = await fetchWithAuthSession('/api/public-artists', { cache: 'no-store' });
  const payload = (await response.json()) as { success?: boolean; data?: SceneArtist[] };
  if (response.ok && payload.success && Array.isArray(payload.data)) {
    return indexArtists(payload.data);
  }
  return [];
}

export function prefetchPublicArtists(): void {
  if (artistsBySlug.size > 0 || inflight) return;
  inflight = fetchPublicArtistsFromNetwork()
    .catch(() => [] as SceneArtist[])
    .finally(() => {
      inflight = null;
    });
}

/** Drop in-memory public-artists list so the next ensure/reload hits the network. */
export function invalidatePublicArtistsCache(): void {
  artistsBySlug = new Map();
  inflight = null;
}

/**
 * Force-reload public artists (genre / name / slug on Universe).
 * Keeps callers off forever-stuck module cache after Dashboard edits.
 */
export function reloadPublicArtists(): Promise<SceneArtist[]> {
  invalidatePublicArtistsCache();
  inflight = fetchPublicArtistsFromNetwork()
    .catch(() => [] as SceneArtist[])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Дождаться списка артистов (общий promise с prefetch / loader). */
export async function ensurePublicArtistsLoaded(): Promise<SceneArtist[]> {
  if (artistsBySlug.size > 0) {
    return Array.from(artistsBySlug.values());
  }
  if (!inflight) {
    prefetchPublicArtists();
  }
  return (await inflight) ?? [];
}
