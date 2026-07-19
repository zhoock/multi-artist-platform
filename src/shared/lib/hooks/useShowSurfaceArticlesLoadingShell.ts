import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectArticlesInFlightFetchContextKey } from '@entities/article';
import { selectArtistAlbumCatalogArtistMissing } from '@entities/album';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';

type ArticlesStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Скелетон статей на главной: не мигать, пока дашборд в полёте качает тот же slice (inFlight = dashboard).
 */
function baseShow(status: ArticlesStatus, hasRenderableData: boolean, cacheStale = false): boolean {
  if (cacheStale) return true;
  const waiting = status === 'loading' || status === 'idle';
  if (!waiting) return false;
  if (hasRenderableData) return false;
  return true;
}

export function useShowSurfaceArticlesLoadingShell(
  articlesStatus: ArticlesStatus,
  hasRenderableData: boolean,
  cacheStale = false
): boolean {
  const artistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const inFlight = useAppSelector(selectArticlesInFlightFetchContextKey);
  const { overlayOpen } = useDashboardModalShell();

  if (artistMissing) return false;

  const show = baseShow(articlesStatus, hasRenderableData, cacheStale);
  if (show && overlayOpen && inFlight === 'dashboard') {
    return false;
  }
  return show;
}
