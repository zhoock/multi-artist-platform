/**
 * Validates stem storage paths for delete/upload guards (IDOR prevention).
 */

export class StemStoragePathError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'StemStoragePathError';
    this.statusCode = statusCode;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** users/{ownerId}/… — at least one segment after owner id */
const OWNED_PATH_RE =
  /^users\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(.+)$/i;

export function normalizeStemStoragePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new StemStoragePathError(400, 'storagePath is required');
  }
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new StemStoragePathError(400, 'Invalid storage path');
  }
  return trimmed.replace(/^\/+/, '');
}

/**
 * Ensures path is under users/{authUserId}/… Returns normalized path for storage.remove().
 */
export function assertOwnedStemStoragePath(storagePath: string, authUserId: string): string {
  const normalized = normalizeStemStoragePath(storagePath);
  const authId = authUserId.trim();

  if (!authId || !UUID_RE.test(authId)) {
    throw new StemStoragePathError(403, 'Cannot delete storage owned by another user');
  }

  const match = OWNED_PATH_RE.exec(normalized);
  if (!match) {
    throw new StemStoragePathError(400, 'Invalid storage path');
  }

  const ownerId = match[1];
  if (ownerId.toLowerCase() !== authId.toLowerCase()) {
    throw new StemStoragePathError(403, 'Cannot delete storage owned by another user');
  }

  return normalized;
}
