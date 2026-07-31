/**
 * Public-facing app origin for emails and browser redirects (server-side).
 * Re-exports shared resolver — never derive from request Host headers.
 */

export {
  LOCAL_DEV_FRONTEND_ORIGIN,
  LEGACY_BAND_PUBLIC_DOMAIN,
  buildPublicAppPath,
  buildPublicSiteUrl,
  getPublicAppOrigin,
  getPublicSiteOrigin,
  isLocalBackendOrigin,
  normalizeOrigin,
  resolvePublicSiteOriginFromEnv,
} from '../../../src/shared/lib/publicSiteOrigin';

import {
  DEFAULT_ROUTE_LANG,
  isRouteLang,
  type RouteLang,
} from '../../../src/shared/lib/i18n/routeLang';
import { buildPublicAlbumPagePath } from '../../../src/shared/lib/seo/publicPagePaths';
import {
  getPublicAppOrigin,
  normalizeOrigin,
  resolvePublicSiteOriginFromEnv,
} from '../../../src/shared/lib/publicSiteOrigin';

export function buildEmailVerificationUrl(token: string): string {
  return `${getPublicAppOrigin()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${getPublicAppOrigin()}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

function resolveAlbumRouteLang(albumLang: string): RouteLang {
  const normalized = albumLang.trim().toLowerCase();
  return isRouteLang(normalized) ? normalized : DEFAULT_ROUTE_LANG;
}

/** Absolute localized public album URL for purchase emails and server notifications. */
export function buildPublicAlbumEmailUrl(options: {
  origin?: string;
  albumLang: string;
  albumSlug: string;
  artistPublicSlug?: string | null;
}): string {
  const origin = normalizeOrigin(options.origin?.trim() || resolvePublicSiteOriginFromEnv());
  const path = buildPublicAlbumPagePath(
    resolveAlbumRouteLang(options.albumLang),
    options.albumSlug,
    options.artistPublicSlug?.trim() ?? ''
  );
  return `${origin}${path}`;
}
