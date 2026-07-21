import type { Location } from 'react-router-dom';
import { isListenerAccount } from '@shared/lib/accountType';
import { shouldForcePostAuthHome } from '@shared/lib/accountDeletedSession';
import type { AuthUser } from '@shared/lib/auth';

const DEFAULT_AFTER_AUTH = '/';

function pathOnly(pathWithQueryOrHash: string): string {
  const q = pathWithQueryOrHash.indexOf('?');
  const h = pathWithQueryOrHash.indexOf('#');
  const cut = Math.min(
    q === -1 ? pathWithQueryOrHash.length : q,
    h === -1 ? pathWithQueryOrHash.length : h
  );
  return pathWithQueryOrHash.slice(0, cut);
}

/** True if destination is auth UI — avoid loops after login. */
function isAuthDestination(pathWithQueryOrHash: string): boolean {
  const p = pathOnly(pathWithQueryOrHash);
  return p === '/auth' || p.startsWith('/auth/');
}

/**
 * Allows only same-site relative navigations (no open redirects).
 */
export function sanitizeReturnPath(candidate: string | null | undefined): string | null {
  if (candidate == null || candidate === '') return null;
  const s = candidate.trim();
  // Path-only relative URLs
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('\\')) return null;
  if (isAuthDestination(s)) return null;

  try {
    const resolved = new URL(s, window.location.origin);
    if (resolved.origin !== window.location.origin) return null;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return null;
  }
}

export function appendReturnTo(
  params: URLSearchParams,
  location: Pick<Location, 'pathname' | 'search'>
): void {
  const candidate = `${location.pathname}${location.search}`;
  const safe = sanitizeReturnPath(candidate);
  if (safe) params.set('returnTo', safe);
}

type BackgroundState = { backgroundLocation?: Location } | undefined;

export function resolvePostAuthDestination(options: {
  returnToSearchParam: string | null;
  routerState?: BackgroundState | null;
}): string {
  if (shouldForcePostAuthHome()) {
    return DEFAULT_AFTER_AUTH;
  }

  const fromQuery = sanitizeReturnPath(options.returnToSearchParam ?? null);
  if (fromQuery) return fromQuery;

  const bg = options.routerState?.backgroundLocation;
  if (bg) {
    const path = `${bg.pathname}${bg.search}${bg.hash}`;
    const safe = sanitizeReturnPath(path);
    if (safe) return safe;
  }

  return DEFAULT_AFTER_AUTH;
}

export function isHomeArtistPagePath(pathWithQuery: string): boolean {
  try {
    const url = new URL(pathWithQuery, 'http://local.invalid');
    const isHome = url.pathname === '/' || url.pathname === '/en';
    return isHome && new URLSearchParams(url.search).has('artist');
  } catch {
    return false;
  }
}

/** Listeners have no artist page — strip `?artist=` from home after auth. */
export function sanitizeListenerPostAuthDestination(path: string): string {
  const safe = sanitizeReturnPath(path) ?? DEFAULT_AFTER_AUTH;
  if (!isHomeArtistPagePath(safe)) return safe;

  try {
    const url = new URL(safe, 'http://local.invalid');
    return url.pathname || DEFAULT_AFTER_AUTH;
  } catch {
    return DEFAULT_AFTER_AUTH;
  }
}

export function resolvePostAuthDestinationForUser(
  user: AuthUser | null | undefined,
  options: {
    returnToSearchParam: string | null;
    routerState?: BackgroundState | null;
  }
): string {
  const destination = resolvePostAuthDestination(options);
  if (!isListenerAccount(user)) return destination;
  return sanitizeListenerPostAuthDestination(destination);
}

/** Location для `backgroundLocation` дашборда из безопасного return path. */
export function locationFromReturnPath(path: string): Location {
  const safe = sanitizeReturnPath(path) ?? DEFAULT_AFTER_AUTH;
  const url = new URL(safe, 'http://local.invalid');
  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    state: null,
    key: 'return-surface',
  };
}

export function resolveReturnPathFromSearchParam(
  returnToSearchParam: string | null | undefined,
  user?: AuthUser | null
): string {
  if (user && isListenerAccount(user)) {
    return resolvePostAuthDestinationForUser(user, {
      returnToSearchParam: returnToSearchParam ?? null,
      routerState: null,
    });
  }
  return sanitizeReturnPath(returnToSearchParam ?? null) ?? DEFAULT_AFTER_AUTH;
}
