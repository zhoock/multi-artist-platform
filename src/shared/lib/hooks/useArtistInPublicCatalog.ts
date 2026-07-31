import { useMemo } from 'react';

import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import {
  selectDashboardAlbumsData,
  selectDashboardAlbumsStatus,
} from '@entities/album/model/selectors';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useOwnArtistPageSummary } from '@shared/lib/hooks/useOwnArtistPageSummary';

/**
 * Whether the signed-in artist already has a public catalog release.
 * Prefers loaded dashboard albums; falls back to own-artist summary while unknown.
 */
export function useArtistInPublicCatalog(enabled = true): boolean {
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsData);
  const dashboardStatus = useAppSelector(selectDashboardAlbumsStatus);
  const { hasPublicReleases, isLoading } = useOwnArtistPageSummary();

  return useMemo(() => {
    if (!enabled) return false;

    if (dashboardStatus === 'succeeded' || dashboardStatus === 'failed') {
      return hasPublishedPublicReleases(dashboardAlbums);
    }

    if (!isLoading) {
      return hasPublicReleases;
    }

    return false;
  }, [enabled, dashboardAlbums, dashboardStatus, hasPublicReleases, isLoading]);
}
