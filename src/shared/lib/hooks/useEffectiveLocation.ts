import { useMemo } from 'react';
import {
  useLocation,
  useSearchParams,
  type Location,
  type SetURLSearchParams,
} from 'react-router-dom';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import {
  getSearchParamsFromLocation,
  resolveEffectiveLocation,
} from '@shared/lib/effectiveLocation';

/**
 * Location underlying-страницы под auth/dashboard overlay.
 * На обычных маршрутах совпадает с `useLocation()`.
 */
export function useEffectiveLocation(): Location {
  const location = useLocation();
  const shell = useDashboardModalShell();

  return useMemo(
    () =>
      resolveEffectiveLocation(location, {
        overlayOpen: shell.overlayOpen,
        surfaceLocation: shell.surfaceLocation,
      }),
    [location, shell.overlayOpen, shell.surfaceLocation]
  );
}

/**
 * Search params underlying-страницы (аналог `useSearchParams` для overlay).
 * Setter по-прежнему пишет в live URL — как у react-router.
 */
export function useEffectiveSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const effectiveLocation = useEffectiveLocation();
  const [, setSearchParams] = useSearchParams();
  const searchParams = useMemo(
    () => getSearchParamsFromLocation(effectiveLocation),
    [effectiveLocation]
  );
  return [searchParams, setSearchParams];
}
