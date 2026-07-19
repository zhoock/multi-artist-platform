import type { Location } from 'react-router-dom';
import type { DashboardModalShellValue } from '@shared/lib/dashboardModalShellContext';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';

type OverlayShell = Pick<DashboardModalShellValue, 'overlayOpen' | 'surfaceLocation'>;

const closedShell: OverlayShell = {
  overlayOpen: false,
  surfaceLocation: null,
};

function readBackgroundLocation(location: Location): Location | null {
  return (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? null;
}

/**
 * Location публичной поверхности под dashboard-/auth-оверлеем.
 *
 * Live URL при открытой модалке — `/dashboard*` или `/auth*`, а страница под ней
 * живёт в `surfaceLocation` / `state.backgroundLocation`. Хуки и страницы должны
 * читать этот effective location, а не live `useLocation()`.
 */
export function resolveEffectiveLocation(
  location: Location,
  shell: OverlayShell = closedShell
): Location {
  if (shell.overlayOpen && shell.surfaceLocation) {
    return shell.surfaceLocation;
  }

  if (!isAuthOverlayPathname(location.pathname)) {
    return location;
  }

  const background = readBackgroundLocation(location);
  if (!background) {
    return location;
  }

  // Auth поверх dashboard: в state лежит dashboard location, публичная страница —
  // ещё один уровень backgroundLocation (как в App authOverlayPublicSurface).
  if (background.pathname.startsWith('/dashboard')) {
    const publicUnderDashboard = readBackgroundLocation(background);
    if (publicUnderDashboard) {
      return publicUnderDashboard;
    }
  }

  return background;
}

export function getSearchParamsFromLocation(location: Location): URLSearchParams {
  const raw = location.search.startsWith('?') ? location.search.slice(1) : location.search;
  return new URLSearchParams(raw);
}
