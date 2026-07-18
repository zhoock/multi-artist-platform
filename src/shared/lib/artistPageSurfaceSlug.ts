import type { Location } from 'react-router-dom';
import type { DashboardModalShellValue } from '@shared/lib/dashboardModalShellContext';

/**
 * Slug публичной страницы артиста для chrome (Hero/Footer/access), пока открыт dashboard-
 * или auth-оверлей: реальный URL — `/dashboard*`/`/auth*`, а `?artist=` живёт в surface.
 */
export function resolveArtistPageSurfaceSlug(
  searchParamsArtist: string | null | undefined,
  shell: Pick<DashboardModalShellValue, 'overlayOpen' | 'surfaceLocation'>
): string {
  if (shell.overlayOpen && shell.surfaceLocation) {
    const fromSurface = getArtistSlugFromSearch(shell.surfaceLocation.search);
    if (fromSurface) return fromSurface;
  }
  return (searchParamsArtist ?? '').trim();
}

export function getArtistSlugFromSearch(search: string | undefined | null): string {
  if (!search) return '';
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(normalized).get('artist')?.trim() ?? '';
}

export function getArtistSlugFromLocationSearch(location: Location | null | undefined): string {
  return getArtistSlugFromSearch(location?.search);
}
