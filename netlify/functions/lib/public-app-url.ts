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

import { buildPublicAppPath, getPublicAppOrigin } from '../../../src/shared/lib/publicSiteOrigin';

export function buildEmailVerificationUrl(token: string): string {
  return `${getPublicAppOrigin()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${getPublicAppOrigin()}/auth/reset-password?token=${encodeURIComponent(token)}`;
}
