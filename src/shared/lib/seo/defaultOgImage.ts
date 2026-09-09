import { buildPublicSiteUrl, normalizeOrigin } from '../publicSiteOrigin';

/** Single platform default Open Graph / Twitter preview image (locale-agnostic). */
export const DEFAULT_OG_IMAGE_PATH = '/og/default.jpg' as const;

export function buildDefaultOgImageUrl(origin?: string): string {
  if (origin) {
    return `${normalizeOrigin(origin)}${DEFAULT_OG_IMAGE_PATH}`;
  }
  return buildPublicSiteUrl(DEFAULT_OG_IMAGE_PATH);
}
