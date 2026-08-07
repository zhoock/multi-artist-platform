/**
 * Single source of truth for public platform URLs (SEO, canonical, og:url, sitemap).
 * In the browser prefers `window.location.origin`; on the server/build uses env chain.
 */

export const LOCAL_DEV_FRONTEND_ORIGIN = 'http://localhost:8080';

/** @internal Regression guard — old band site domain must not appear in production URLs. */
export const FORBIDDEN_PUBLIC_DOMAIN = 'smolyanoechuchelko.ru';

export function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '');
}

function readProcessEnv(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

export function isLocalBackendOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return false;
    }
    return parsed.port === '8888';
  } catch {
    return false;
  }
}

/**
 * Server / build-time origin (Netlify functions, sitemap generation).
 * Priority: PUBLIC_APP_URL → NETLIFY_SITE_URL → URL → DEPLOY_PRIME_URL → localhost:8080.
 */
export function resolvePublicSiteOriginFromEnv(): string {
  const candidates = [
    readProcessEnv('PUBLIC_APP_URL'),
    readProcessEnv('NETLIFY_SITE_URL'),
    readProcessEnv('URL'),
    readProcessEnv('DEPLOY_PRIME_URL'),
  ].filter((value): value is string => Boolean(value));

  for (const raw of candidates) {
    const origin = normalizeOrigin(raw);
    if (!isLocalBackendOrigin(origin)) {
      return origin;
    }
  }

  return LOCAL_DEV_FRONTEND_ORIGIN;
}

/**
 * Public site origin for UI and SEO tags.
 * Uses the live browser origin when available; otherwise falls back to env resolution.
 */
export function getPublicSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = normalizeOrigin(window.location.origin);
    if (!isLocalBackendOrigin(origin)) {
      return origin;
    }

    // Netlify Dev serves the UI on :8888 — use canonical local frontend origin in browser
    // (process.env is not available client-side without webpack DefinePlugin shims).
    return LOCAL_DEV_FRONTEND_ORIGIN;
  }

  return resolvePublicSiteOriginFromEnv();
}

export function buildPublicSiteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getPublicSiteOrigin()}${path}`;
}

/** Alias for server-side callers that must not read `window`. */
export const getPublicAppOrigin = resolvePublicSiteOriginFromEnv;

/** Alias used by payment/email helpers on the server. */
export function buildPublicAppPath(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${resolvePublicSiteOriginFromEnv()}${path}`;
}
