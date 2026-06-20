/**
 * Archive API: статус и добавление артиста.
 * Требуют JWT; без токена не вызывать (optional feature — не инвалидирует сессию).
 */

import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

export interface ArchiveStatus {
  isPremium: boolean;
  artistInArchive: boolean;
  slotsUsed: number;
  slotsLimit: number;
}

export interface MyArchiveArtist {
  id: string;
  artistUserId: string;
  slug: string;
  name: string;
  genreCode: string;
  genreLabel: { en: string; ru: string };
  cover: string | null;
  addedAt: string;
  lockedUntil: string | null;
  isLocked: boolean;
}

export interface MyArchiveData {
  isPremium: boolean;
  slotsUsed: number;
  slotsLimit: number;
  artists: MyArchiveArtist[];
}

export type ArchiveApiErrorCode =
  | 'ARCHIVE_SLOTS_LIMIT'
  | 'ARCHIVE_SUBSCRIPTION_REQUIRED'
  | 'ARCHIVE_ARTIST_LOCKED'
  | 'ARCHIVE_SELF_ADD'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class ArchiveApiError extends Error {
  constructor(
    message: string,
    public readonly code: ArchiveApiErrorCode,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ArchiveApiError';
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
}

function parseErrorCode(raw: string | undefined): ArchiveApiErrorCode {
  if (raw === 'ARCHIVE_SLOTS_LIMIT') return 'ARCHIVE_SLOTS_LIMIT';
  if (raw === 'ARCHIVE_SUBSCRIPTION_REQUIRED') return 'ARCHIVE_SUBSCRIPTION_REQUIRED';
  if (raw === 'ARCHIVE_ARTIST_LOCKED') return 'ARCHIVE_ARTIST_LOCKED';
  if (raw === 'ARCHIVE_SELF_ADD') return 'ARCHIVE_SELF_ADD';
  if (raw === 'UNAUTHORIZED' || raw === 'SESSION_EXPIRED' || raw === 'INVALID_SESSION') {
    return 'UNAUTHORIZED';
  }
  return 'UNKNOWN';
}

async function readApiError(response: Response): Promise<ArchiveApiError> {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<unknown>;
  return new ArchiveApiError(
    payload.error || `HTTP error! status: ${response.status}`,
    parseErrorCode(payload.code),
    response.status
  );
}

export async function getArchiveStatus(artistUserId: string): Promise<ArchiveStatus | null> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return null;
  }

  const response = await fetchWithAuthSession(
    `/api/archive-status?artistUserId=${encodeURIComponent(artistUserId)}`,
    { headers: { ...authHeader } }
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<ArchiveStatus>;
  if (!payload.success || !payload.data) {
    throw new ArchiveApiError(payload.error || 'Failed to load archive status', 'UNKNOWN');
  }

  return payload.data;
}

export async function addArtistToArchiveApi(artistUserId: string): Promise<{
  status: ArchiveStatus;
}> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new ArchiveApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const response = await fetchWithAuthSession('/api/add-to-archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ artistUserId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<{ status: ArchiveStatus }>;
  if (!payload.success || !payload.data?.status) {
    throw new ArchiveApiError(payload.error || 'Failed to add artist to archive', 'UNKNOWN');
  }

  return { status: payload.data.status };
}

export async function getMyArchive(): Promise<MyArchiveData> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new ArchiveApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const response = await fetchWithAuthSession('/api/my-archive', {
    headers: { ...authHeader },
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<MyArchiveData>;
  if (!payload.success || !payload.data) {
    throw new ArchiveApiError(payload.error || 'Failed to load archive', 'UNKNOWN');
  }

  return payload.data;
}

export async function removeArtistFromArchiveApi(artistUserId: string): Promise<{
  archive: MyArchiveData;
}> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new ArchiveApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const response = await fetchWithAuthSession('/api/remove-from-archive', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ artistUserId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<{ archive: MyArchiveData }>;
  if (!payload.success || !payload.data?.archive) {
    throw new ArchiveApiError(payload.error || 'Failed to remove from archive', 'UNKNOWN');
  }

  return { archive: payload.data.archive };
}
