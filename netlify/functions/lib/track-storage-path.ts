/**
 * Validates track audio storage paths for upload guards (IDOR prevention).
 */

import { isPipelineManagedAudioStoragePath } from '../../../src/shared/lib/tracks/storagePathReference';

export class TrackStoragePathError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'TrackStoragePathError';
    this.statusCode = statusCode;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** users/{ownerId}/… — at least one segment after owner id */
const OWNED_PATH_RE =
  /^users\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(.+)$/i;

const PERCENT_ENCODED_BYTE = /%[0-9a-fA-F]{2}/;

export function normalizeTrackStoragePath(raw: string): string {
  let path = raw.trim();
  if (!path) {
    throw new TrackStoragePathError(400, 'storagePath is required');
  }

  for (let i = 0; i < 5; i++) {
    if (!PERCENT_ENCODED_BYTE.test(path)) {
      break;
    }
    try {
      path = decodeURIComponent(path);
    } catch {
      throw new TrackStoragePathError(400, 'Invalid storage path encoding');
    }
  }

  if (PERCENT_ENCODED_BYTE.test(path)) {
    throw new TrackStoragePathError(400, 'Invalid storage path encoding');
  }

  if (path.includes('?')) {
    path = path.split('?')[0];
  }

  if (path.includes('..') || path.includes('\\') || path.includes('\0')) {
    throw new TrackStoragePathError(400, 'Invalid storage path');
  }

  path = path.replace(/^\/+/, '');
  if (!path) {
    throw new TrackStoragePathError(400, 'storagePath is required');
  }

  const segments = path.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new TrackStoragePathError(400, 'Invalid storage path');
    }
  }

  return path;
}

/**
 * Ensures path is owned track audio under users/{authUserId}/audio/.../original|derived/...
 */
export function assertOwnedTrackStoragePath(storagePath: string, authUserId: string): string {
  const normalized = normalizeTrackStoragePath(storagePath);
  const authId = authUserId.trim();

  if (!authId || !UUID_RE.test(authId)) {
    throw new TrackStoragePathError(403, 'Cannot use storage owned by another user');
  }

  const match = OWNED_PATH_RE.exec(normalized);
  if (!match) {
    throw new TrackStoragePathError(403, 'Invalid storage path');
  }

  const ownerId = match[1];
  if (ownerId.toLowerCase() !== authId.toLowerCase()) {
    throw new TrackStoragePathError(403, 'Cannot use storage owned by another user');
  }

  if (!isPipelineManagedAudioStoragePath(normalized)) {
    throw new TrackStoragePathError(
      403,
      'Storage path must be a track audio original or derived asset'
    );
  }

  return normalized;
}
