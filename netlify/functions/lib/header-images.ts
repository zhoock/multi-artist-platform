/**
 * Server-side normalization for `users.header_images`.
 *
 * Clients build display URLs from the current browser origin, so persisting whatever they send
 * lets a local dev origin (`http://localhost:8080/...`) reach production readers. The stored form
 * is therefore always the bucket-relative storage path `users/<owner>/hero/<file>`; every origin
 * is discarded on the way in and the display URL is rebuilt by readers.
 */

import { assertPublicProxyImagePath, ProxyImagePathError } from './proxy-image-path';

/** Pathnames served by the proxy-image function: direct, and via the `/api` redirect. */
const PROXY_IMAGE_PATHNAMES = new Set(['/api/proxy-image', '/.netlify/functions/proxy-image']);

/** Only hero images belong in this column, even though the proxy allows other public categories. */
const HERO_CATEGORY = 'hero';

/** Origin placeholder for root-relative input; the resolved origin is never read. */
const URL_PARSE_BASE = 'http://header-images.invalid';

export class HeaderImagesValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'HeaderImagesValidationError';
  }
}

/**
 * Pulls the storage path out of a proxy-image URL.
 * Returns `null` when the value is not URL-shaped and should be read as a bare storage path.
 */
function extractProxyImagePath(value: string): string | null {
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (!hasScheme && !value.startsWith('/')) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, URL_PARSE_BASE);
  } catch {
    throw new HeaderImagesValidationError('value is not a valid URL');
  }

  // The origin is intentionally ignored: a proxy-image URL from any host carries the same storage
  // path, and anything else is an external image we refuse to store.
  if (!PROXY_IMAGE_PATHNAMES.has(url.pathname)) {
    throw new HeaderImagesValidationError(
      'only proxy-image URLs and bare storage paths are accepted'
    );
  }

  const path = url.searchParams.get('path');
  if (!path?.trim()) {
    throw new HeaderImagesValidationError('proxy-image URL has no "path" parameter');
  }

  return path;
}

/** `null` for blank entries, which are dropped rather than stored — same as the read path. */
function normalizeEntry(raw: unknown, ownerId: string): string | null {
  if (typeof raw !== 'string') {
    throw new HeaderImagesValidationError('must be a string');
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  const candidate = extractProxyImagePath(value) ?? value;

  let storagePath: string;
  try {
    storagePath = assertPublicProxyImagePath(candidate);
  } catch (error) {
    if (error instanceof ProxyImagePathError) {
      throw new HeaderImagesValidationError(error.message);
    }
    throw error;
  }

  const segments = storagePath.split('/');
  // Path shape is already guaranteed by assertPublicProxyImagePath: users/<uuid>/<category>/…
  if (segments[1].toLowerCase() !== ownerId.trim().toLowerCase()) {
    throw new HeaderImagesValidationError('storage path belongs to another user');
  }

  if (segments[2].toLowerCase() !== HERO_CATEGORY) {
    throw new HeaderImagesValidationError(`storage path is not a ${HERO_CATEGORY} image`);
  }

  return storagePath;
}

/**
 * Validates a client-supplied `headerImages` array and returns the canonical values to persist.
 * Throws {@link HeaderImagesValidationError} on anything that cannot be reduced to a storage path
 * owned by `ownerId`.
 */
export function normalizeHeaderImagesForSave(value: unknown, ownerId: string): string[] {
  if (!Array.isArray(value)) {
    throw new HeaderImagesValidationError('headerImages must be an array');
  }

  const normalized: string[] = [];

  value.forEach((entry, index) => {
    try {
      const storagePath = normalizeEntry(entry, ownerId);
      if (storagePath) {
        normalized.push(storagePath);
      }
    } catch (error) {
      if (error instanceof HeaderImagesValidationError) {
        throw new HeaderImagesValidationError(`headerImages[${index}]: ${error.message}`);
      }
      throw error;
    }
  });

  return normalized;
}
