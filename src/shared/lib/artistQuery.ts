import { isDashboardAlbumsPublicCatalogOverlay } from '@shared/lib/dashboardModalBackground';

export { withPublicArtistQuery } from '@shared/lib/publicArtistQueryLink';

interface BuildApiUrlOptions {
  includeArtist?: boolean;
  /**
   * Public artist slug for `artist` query param. Callers should pass Redux `currentArtist.publicSlug`
   * (or an explicit slug); URL is not used as a fallback.
   */
  artistSlugOverride?: string | null;
  /** Обходить правило «на /dashboard* не добавлять artist» (sync публичного каталога из кабинета). */
  forceArtistQuery?: boolean;
}

function shouldIncludeArtistOnCurrentPage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const path = window.location.pathname;
  // Оверлей кабинета: в адресной строке /dashboard*, но грузим публичный каталог — нужен ?artist=.
  if (path.startsWith('/dashboard') && isDashboardAlbumsPublicCatalogOverlay()) {
    return true;
  }
  // Полноэкранный кабинет: artist в query не передаём (JWT + режим владельца на бэкенде).
  return !path.startsWith('/dashboard');
}

export function buildApiUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: BuildApiUrlOptions = {}
): string {
  const includeArtist = options.includeArtist ?? false;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }

  if (
    includeArtist &&
    (options.forceArtistQuery || shouldIncludeArtistOnCurrentPage()) &&
    typeof window !== 'undefined'
  ) {
    const slug = options.artistSlugOverride ? String(options.artistSlugOverride).trim() : '';
    if (slug) {
      query.set('artist', slug);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[buildApiUrl] includeArtist is true but artist slug is empty — public API calls must include artist from the store.'
      );
    }
  }

  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}
