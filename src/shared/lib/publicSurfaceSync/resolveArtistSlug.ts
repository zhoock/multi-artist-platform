import { getStore } from '@shared/model/appStore';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { readPublicArtistSlugFromDashboardModalBackground } from '@shared/lib/dashboardModalBackground';

/** Best-effort public artist slug for SWR revalidation under dashboard overlay. */
export function resolvePublicSurfaceArtistSlug(explicit?: string | null): string | null {
  const fromArg = explicit?.trim();
  if (fromArg) return fromArg;

  if (typeof window !== 'undefined') {
    const fromModalBg = readPublicArtistSlugFromDashboardModalBackground();
    if (fromModalBg) return fromModalBg;

    const fromQuery = new URLSearchParams(window.location.search).get('artist')?.trim();
    if (fromQuery) return fromQuery;
  }

  return selectPublicArtistSlug(getStore().getState())?.trim() || null;
}
