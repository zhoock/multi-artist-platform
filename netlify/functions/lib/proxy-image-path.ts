/**
 * Allowlist validation for GET /api/proxy-image.
 * Only public image categories may be proxied (hero, albums, articles, profile).
 */

export class ProxyImagePathError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ProxyImagePathError';
    this.statusCode = statusCode;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_CATEGORIES = new Set(['hero', 'albums', 'articles', 'profile']);

/** Whole path segments that must never be proxied. */
const FORBIDDEN_SEGMENTS = new Set(['audio', 'stems', 'uploads', 'drafts', 'original', 'derived']);

const MAX_DECODE_PASSES = 5;
const PERCENT_ENCODED_BYTE = /%[0-9a-fA-F]{2}/;

function decodeProxyImagePath(raw: string): string {
  let path = raw.trim();
  if (!path) {
    throw new ProxyImagePathError(400, 'Missing path');
  }

  if (path.includes('?')) {
    path = path.split('?')[0];
  }

  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    if (!PERCENT_ENCODED_BYTE.test(path)) {
      break;
    }
    try {
      path = decodeURIComponent(path);
    } catch {
      throw new ProxyImagePathError(400, 'Invalid path encoding');
    }
  }

  if (PERCENT_ENCODED_BYTE.test(path)) {
    throw new ProxyImagePathError(400, 'Invalid path encoding');
  }

  if (path.includes('\\') || path.includes('\0')) {
    throw new ProxyImagePathError(400, 'Invalid storage path');
  }

  return path.replace(/^\/+/, '');
}

function assertSafeSegments(segments: string[]): void {
  if (segments.length === 0) {
    throw new ProxyImagePathError(400, 'Invalid storage path');
  }

  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new ProxyImagePathError(400, 'Invalid storage path');
    }
    if (segment.includes('\\') || segment.includes('\0')) {
      throw new ProxyImagePathError(400, 'Invalid storage path');
    }
    if (FORBIDDEN_SEGMENTS.has(segment.toLowerCase())) {
      throw new ProxyImagePathError(403, 'Path is not allowed for proxy');
    }
  }
}

/**
 * Normalizes and validates a storage path for public proxy-image access.
 * Returns the canonical bucket-relative path on success.
 */
export function assertPublicProxyImagePath(raw: string): string {
  const normalized = decodeProxyImagePath(raw);

  if (normalized.includes('..')) {
    throw new ProxyImagePathError(400, 'Invalid storage path');
  }

  const segments = normalized.split('/');
  assertSafeSegments(segments);

  if (segments.length < 4) {
    throw new ProxyImagePathError(403, 'Path is not allowed for proxy');
  }

  if (segments[0] !== 'users') {
    throw new ProxyImagePathError(403, 'Path is not allowed for proxy');
  }

  const userId = segments[1];
  if (!UUID_RE.test(userId)) {
    throw new ProxyImagePathError(403, 'Path is not allowed for proxy');
  }

  const category = segments[2].toLowerCase();
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new ProxyImagePathError(403, 'Path is not allowed for proxy');
  }

  return normalized;
}
