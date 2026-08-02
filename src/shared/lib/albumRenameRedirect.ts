import type { Location, NavigateFunction } from 'react-router-dom';

import {
  getAlbumPageSurfaceLocation,
  getArtistSlugFromLocation,
  getOpenAlbumIdFromPathname,
} from '@shared/lib/albumDeletedRedirect';
import {
  captureDashboardModalBackground,
  readDashboardModalBackground,
} from '@shared/lib/dashboardModalBackground';
import { DEFAULT_ROUTE_LANG, parseLangFromPath, type RouteLang } from '@shared/lib/i18n/routeLang';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';

function isDashboardPathname(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

function resolveRouteLangFromPathname(pathname: string): RouteLang {
  return parseLangFromPath(pathname).lang ?? DEFAULT_ROUTE_LANG;
}

export function buildPublicAlbumPath(
  albumId: string,
  artistSlug: string,
  lang: RouteLang = DEFAULT_ROUTE_LANG
): string {
  return buildPublicAlbumPagePath(lang, albumId, artistSlug);
}

/**
 * After album slug rename: keep the user on the same album surface with the new URL.
 * Uses replace so the dead slug is not left in browser history.
 *
 * - Direct album route → replace `/{lang}/albums/:newId?artist=`
 * - Dashboard overlay over that album → replace `backgroundLocation` (+ session bg)
 * - Otherwise → only rewrite stored modal background if it still points at the old slug
 */
export function navigateAfterAlbumSlugRename(input: {
  previousAlbumId: string;
  newAlbumId: string;
  artistSlug: string;
  navigate: NavigateFunction;
  location: Location;
}): boolean {
  const previousAlbumId = input.previousAlbumId.trim();
  const newAlbumId = input.newAlbumId.trim();
  const artistSlug = input.artistSlug.trim();
  if (!previousAlbumId || !newAlbumId || !artistSlug || previousAlbumId === newAlbumId) {
    return false;
  }

  const backgroundFromState = (
    input.location.state as { backgroundLocation?: Location } | null | undefined
  )?.backgroundLocation;
  const surface = getAlbumPageSurfaceLocation(input.location, backgroundFromState);
  const routeLang = surface
    ? resolveRouteLangFromPathname(surface.pathname)
    : resolveRouteLangFromPathname(input.location.pathname);

  const nextPath = buildPublicAlbumPagePath(routeLang, newAlbumId, artistSlug);
  const qMark = nextPath.indexOf('?');
  const nextPathname = qMark === -1 ? nextPath : nextPath.slice(0, qMark);
  const nextSearch = qMark === -1 ? '' : nextPath.slice(qMark);
  const nextSurface: Location = {
    pathname: nextPathname,
    search: nextSearch,
    hash: '',
    state: null,
    key: 'album-rename',
  };

  const openAlbumId = surface ? getOpenAlbumIdFromPathname(surface.pathname) : null;
  const viewingRenamedAlbum = openAlbumId === previousAlbumId;

  const stored = readDashboardModalBackground();
  const storedPointsAtOld =
    stored != null && getOpenAlbumIdFromPathname(stored.pathname) === previousAlbumId;

  if (viewingRenamedAlbum || storedPointsAtOld) {
    captureDashboardModalBackground({
      pathname: nextPathname,
      search: nextSearch,
      hash: '',
    });
  }

  if (!viewingRenamedAlbum) {
    return false;
  }

  if (isDashboardPathname(input.location.pathname)) {
    const prevState =
      input.location.state && typeof input.location.state === 'object'
        ? (input.location.state as Record<string, unknown>)
        : {};
    input.navigate(
      {
        pathname: input.location.pathname,
        search: input.location.search,
        hash: input.location.hash,
      },
      {
        replace: true,
        state: {
          ...prevState,
          backgroundLocation: nextSurface,
        },
      }
    );
    return true;
  }

  input.navigate(nextPath, { replace: true });
  return true;
}

export function resolveArtistSlugForAlbumRename(
  location: Location,
  fallbackArtistSlug?: string | null
): string | null {
  const backgroundFromState = (
    location.state as { backgroundLocation?: Location } | null | undefined
  )?.backgroundLocation;
  const surface = getAlbumPageSurfaceLocation(location, backgroundFromState);
  if (surface) {
    const fromSurface = getArtistSlugFromLocation(surface);
    if (fromSurface) return fromSurface;
  }
  const fromLive = getArtistSlugFromLocation(location);
  if (fromLive) return fromLive;
  return fallbackArtistSlug?.trim() || null;
}
