import { useCallback, useEffect } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { isDashboardAppPathname } from '@shared/lib/albumsRouteScope';

/**
 * Блокирует уход с Dashboard через роутинг и предупреждает при закрытии вкладки,
 * пока `active === true` (открыт редактор альбома или статьи с несохранёнными изменениями).
 */
export function useUnsavedNavigationLeaveGuard(active: boolean) {
  const shouldBlockNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      active &&
      isDashboardAppPathname(currentLocation.pathname) &&
      !isDashboardAppPathname(nextLocation.pathname),
    [active]
  );

  const blocker = useBlocker(shouldBlockNavigation);

  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  return blocker;
}
