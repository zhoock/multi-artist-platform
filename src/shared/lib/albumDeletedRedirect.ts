import { matchPath, type Location, type NavigateFunction } from 'react-router-dom';

import {
  clearDashboardModalBackground,
  readDashboardModalBackground,
} from '@shared/lib/dashboardModalBackground';
import { markAlbumDeletedLeavePage } from '@shared/lib/albumDeletedSession';
import { DEFAULT_ROUTE_LANG, stripLangPrefix, type RouteLang } from '@shared/lib/i18n/routeLang';
import { buildOwnArtistPagePath } from '@shared/lib/ownArtistPage';

function isDashboardPathname(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

export function getArtistSlugFromLocation(location: Location): string | null {
  const slug = new URLSearchParams(location.search).get('artist')?.trim();
  return slug || null;
}

export function getOpenAlbumIdFromPathname(pathname: string): string | null {
  const match = matchPath({ path: '/albums/:albumId', end: true }, stripLangPrefix(pathname));
  return match?.params.albumId?.trim() || null;
}

/** Страница альбома, которую видит пользователь (под модальным дашбордом или как текущий маршрут). */
export function getAlbumPageSurfaceLocation(
  location: Location,
  backgroundLocation?: Location
): Location | null {
  if (isDashboardPathname(location.pathname)) {
    if (backgroundLocation && !isDashboardPathname(backgroundLocation.pathname)) {
      return backgroundLocation;
    }
    const stored = readDashboardModalBackground();
    if (stored && !stored.pathname.startsWith('/dashboard')) {
      return {
        pathname: stored.pathname,
        search: stored.search,
        hash: stored.hash,
        state: null,
        key: 'album-deleted-stored-bg',
      };
    }
    return null;
  }

  if (getOpenAlbumIdFromPathname(location.pathname)) {
    return location;
  }

  return null;
}

export type DeletedAlbumRedirectTarget = {
  albumId: string;
  artistSlug: string;
};

export function resolveDeletedAlbumRedirectTarget(
  deletedAlbumId: string,
  location: Location,
  backgroundLocation: Location | undefined,
  fallbackArtistSlug: string | null | undefined
): DeletedAlbumRedirectTarget | null {
  const surface = getAlbumPageSurfaceLocation(location, backgroundLocation);
  if (!surface) return null;

  const openAlbumId = getOpenAlbumIdFromPathname(surface.pathname);
  if (!openAlbumId || openAlbumId !== deletedAlbumId) return null;

  const artistSlug = getArtistSlugFromLocation(surface) ?? fallbackArtistSlug?.trim() ?? null;
  if (!artistSlug) return null;

  return { albumId: openAlbumId, artistSlug };
}

/** Помечает уход с удалённого альбома (до refetch) и после успеха ведёт на страницу артиста. */
export function navigateAwayFromDeletedAlbumPage(
  target: DeletedAlbumRedirectTarget,
  navigate: NavigateFunction,
  lang: RouteLang = DEFAULT_ROUTE_LANG
): void {
  markAlbumDeletedLeavePage(target);
  clearDashboardModalBackground();
  navigate(buildOwnArtistPagePath(lang, target.artistSlug), { replace: true });
}
