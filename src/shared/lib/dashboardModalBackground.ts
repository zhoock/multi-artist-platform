import type { Location } from 'react-router-dom';

import { parseLangFromPath, withLangPrefix, type RouteLang } from '@shared/lib/i18n/routeLang';
import { isDashboardPathname } from '@shared/lib/publicArtistContext';

const STORAGE_KEY = 'sc-dashboard-modal-bg';

/**
 * Синхронно выставляется из Layout при рендере: при открытом дашборд-оверлее URL = /dashboard*,
 * но каталог альбомов в Redux должен оставаться в публичном контексте (как у страницы под модалкой),
 * иначе после закрытия меняется fetchContextKey и снова гоняется fetch.
 */
let dashboardAlbumsPublicCatalogOverlay = false;

export function syncDashboardAlbumsPublicCatalogOverlay(active: boolean): void {
  dashboardAlbumsPublicCatalogOverlay = active;
}

export function isDashboardAlbumsPublicCatalogOverlay(): boolean {
  return dashboardAlbumsPublicCatalogOverlay;
}

/**
 * Публичный каталог (альбомы/статьи с ?artist=) в Redux — на витрине и под модальным дашбордом.
 * Полноэкранный /dashboard* без фона — отдельный dashboard bucket владельца.
 */
export function shouldUsePublicArtistCatalogInRedux(): boolean {
  if (typeof window === 'undefined') return true;
  return !isDashboardPathname() || isDashboardAlbumsPublicCatalogOverlay();
}

/** Slug артиста из фоновой страницы под модальным дашбордом (?artist= в sessionStorage). */
export function readPublicArtistSlugFromDashboardModalBackground(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!window.location.pathname.startsWith('/dashboard')) return undefined;
  const bg = readDashboardModalBackground();
  if (!bg || bg.pathname.startsWith('/dashboard')) return undefined;
  const slug = new URLSearchParams(bg.search).get('artist')?.trim();
  return slug || undefined;
}

export type DashboardModalBackground = {
  pathname: string;
  search: string;
  hash: string;
};

function splitRelativePath(fullPath: string): DashboardModalBackground {
  const queryIndex = fullPath.indexOf('?');
  const hashIndex = fullPath.indexOf('#');

  let cutIndex = fullPath.length;
  if (queryIndex !== -1) cutIndex = Math.min(cutIndex, queryIndex);
  if (hashIndex !== -1) cutIndex = Math.min(cutIndex, hashIndex);

  const pathname = fullPath.slice(0, cutIndex) || '/';
  const searchEnd = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : fullPath.length;
  const search =
    queryIndex !== -1
      ? fullPath.slice(queryIndex, searchEnd === queryIndex ? undefined : searchEnd)
      : '';
  const hash = hashIndex !== -1 ? fullPath.slice(hashIndex) : '';

  return { pathname, search, hash };
}

/** Rewrites a locale-prefixed dashboard modal background to the chosen UI language. */
export function localizeDashboardModalBackground(
  bg: DashboardModalBackground,
  lang: RouteLang
): DashboardModalBackground {
  const { lang: pathLang } = parseLangFromPath(bg.pathname);
  if (!pathLang) return bg;

  const fullPath = `${bg.pathname}${bg.search}${bg.hash ?? ''}`;
  return splitRelativePath(withLangPrefix(lang, fullPath));
}

export const PAYMENT_RETURN_PATHS = [
  '/pay/status',
  '/pay/success',
  '/pay/fail',
  '/pay/subscription-success',
] as const;

export function isPaymentReturnPathname(pathname: string): boolean {
  return (PAYMENT_RETURN_PATHS as readonly string[]).includes(pathname);
}

export function isValidDashboardModalBackground(
  bg: Pick<DashboardModalBackground, 'pathname'> | Location | null | undefined
): boolean {
  if (!bg || typeof bg.pathname !== 'string' || !bg.pathname.startsWith('/')) {
    return false;
  }
  if (bg.pathname.startsWith('/dashboard')) return false;
  if (isPaymentReturnPathname(bg.pathname)) return false;
  return true;
}

/** Минимальный Location для `Routes location={…}` (модальный дашборд поверх другой страницы). */
export function locationFromDashboardModalStored(
  bg: DashboardModalBackground,
  key = 'dashboard-modal-bg'
): Location {
  return {
    pathname: bg.pathname,
    search: bg.search,
    hash: bg.hash,
    state: null,
    key,
  };
}

export function captureDashboardModalBackground(bg: DashboardModalBackground): void {
  if (!isValidDashboardModalBackground(bg)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bg));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearDashboardModalBackground(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readDashboardModalBackground(): DashboardModalBackground | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<DashboardModalBackground>;
    if (
      typeof p.pathname !== 'string' ||
      !isValidDashboardModalBackground(p as DashboardModalBackground)
    ) {
      return null;
    }
    return {
      pathname: p.pathname,
      search: typeof p.search === 'string' ? p.search : '',
      hash: typeof p.hash === 'string' ? p.hash : '',
    };
  } catch {
    return null;
  }
}

/** Перед клиентским переходом на /dashboard-new с backgroundLocation — чтобы loader увидел фон до первого commit Layout. */
export function primeDashboardModalSessionFromLocation(current: Location): void {
  if (isPaymentReturnPathname(current.pathname)) {
    return;
  }

  const nested = (current.state as { backgroundLocation?: Location } | null | undefined)
    ?.backgroundLocation;
  if (nested && isValidDashboardModalBackground(nested)) {
    captureDashboardModalBackground({
      pathname: nested.pathname,
      search: nested.search,
      hash: nested.hash ?? '',
    });
    return;
  }
  if (!current.pathname.startsWith('/dashboard') && isValidDashboardModalBackground(current)) {
    captureDashboardModalBackground({
      pathname: current.pathname,
      search: current.search,
      hash: current.hash ?? '',
    });
  }
}

export function resolveDashboardModalCloseTarget(options: {
  backgroundLocation?: Location | null;
}): Location | null {
  if (options.backgroundLocation && isValidDashboardModalBackground(options.backgroundLocation)) {
    return options.backgroundLocation;
  }

  const stored = readDashboardModalBackground();
  if (stored) {
    return locationFromDashboardModalStored(stored);
  }

  return null;
}

export function resolveDashboardModalOpenStateFromStoredBackground(): {
  state?: { backgroundLocation: Location };
} {
  const stored = readDashboardModalBackground();
  if (!stored) return {};
  return { state: { backgroundLocation: locationFromDashboardModalStored(stored) } };
}

export function isDashboardModalOverNonDashboardBackground(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.location.pathname.startsWith('/dashboard')) return false;
  const bg = readDashboardModalBackground();
  if (!bg) return false;
  return !bg.pathname.startsWith('/dashboard');
}

/** Для albumsLoader: подменяем pathname/search на фон, если открыт модальный дашборд. */
export function resolveDashboardModalBackgroundForLoader(
  requestPathname: string,
  requestSearch: string
): { pathname: string; search: string } {
  if (!requestPathname.startsWith('/dashboard')) {
    return { pathname: requestPathname, search: requestSearch };
  }
  const bg = readDashboardModalBackground();
  if (bg && !bg.pathname.startsWith('/dashboard') && isValidDashboardModalBackground(bg)) {
    return { pathname: bg.pathname, search: bg.search };
  }
  return { pathname: requestPathname, search: requestSearch };
}
