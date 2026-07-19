import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  selectDashboardAlbumsInFlightFetchContextKey,
  selectArtistAlbumCatalogArtistMissing,
} from '@entities/album';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';

type AlbumsStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Показывать ли полноэкранный скелетон/блокировку по статусу альбомов.
 * Пока в store уже есть данные для списка/альбома, не скрываем UI при loading/idle
 * (фоновый refetch после auth-change, из кабинета, закрытие дашборда и т.д.).
 */
export function shouldShowAlbumsLoadingShell(
  albumsStatus: AlbumsStatus,
  hasRenderableAlbumsData: boolean,
  catalogCacheStale = false
): boolean {
  if (catalogCacheStale) return true;
  const waiting = albumsStatus === 'loading' || albumsStatus === 'idle';
  if (!waiting) return false;
  if (hasRenderableAlbumsData) return false;
  return true;
}

/**
 * Как `shouldShowAlbumsLoadingShell`, но не показываем «загрузку» на **фоновой** surface,
 * пока дашборд-оверлей в полёте тянет owner fat-albums (`dashboard.inFlight`).
 */
export function useShowAlbumsLoadingShellExcludingDashboardInFlight(baseShow: boolean): boolean {
  const inFlight = useAppSelector(selectDashboardAlbumsInFlightFetchContextKey);
  const { overlayOpen } = useDashboardModalShell();
  if (baseShow && overlayOpen && inFlight === 'dashboard') {
    return false;
  }
  return baseShow;
}

/** Всё вместе: скелетон по status + подавление на фоне при загрузке из дашборда. */
export function useShowSurfaceAlbumsLoadingShell(
  albumsStatus: AlbumsStatus,
  hasRenderableAlbumsData: boolean,
  catalogCacheStale = false
): boolean {
  const artistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const base = shouldShowAlbumsLoadingShell(
    albumsStatus,
    hasRenderableAlbumsData,
    catalogCacheStale
  );
  const show = useShowAlbumsLoadingShellExcludingDashboardInFlight(base);
  if (artistMissing) return false;
  return show;
}
