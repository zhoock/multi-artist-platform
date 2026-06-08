/**
 * Saved Mixes API: пресеты микшера публичной страницы /stems.
 * Создание/список/удаление требуют JWT; shared-микс читается без авторизации.
 */

import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  generateMixName,
  type SavedMix,
  type SavedMixSetting,
  type SharedMix,
} from '@entities/savedMix';

export type SavedMixApiErrorCode = 'UNAUTHORIZED' | 'MIX_NOT_FOUND' | 'UNKNOWN';

export class SavedMixApiError extends Error {
  constructor(
    message: string,
    public readonly code: SavedMixApiErrorCode,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'SavedMixApiError';
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
}

function parseErrorCode(raw: string | undefined): SavedMixApiErrorCode {
  if (raw === 'MIX_NOT_FOUND') return 'MIX_NOT_FOUND';
  if (raw === 'UNAUTHORIZED' || raw === 'SESSION_EXPIRED' || raw === 'INVALID_SESSION') {
    return 'UNAUTHORIZED';
  }
  return 'UNKNOWN';
}

async function readApiError(response: Response): Promise<SavedMixApiError> {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<unknown>;
  return new SavedMixApiError(
    payload.error || `HTTP error! status: ${response.status}`,
    parseErrorCode(payload.code),
    response.status
  );
}

export interface CreateMixPayload {
  albumId: string;
  trackId: string;
  /** Необязательное имя; пустое заменяется автоименем `{Track} • DD.MM.YYYY HH:mm`. */
  name?: string;
  trackTitle: string;
  albumTitle?: string;
  artistSlug?: string | null;
  settings: SavedMixSetting[];
}

export async function getMyMixes(): Promise<SavedMix[]> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new SavedMixApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const response = await fetchWithAuthSession('/api/my-saved-mixes', {
    headers: { ...authHeader },
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<{ mixes: SavedMix[] }>;
  if (!payload.success || !payload.data) {
    throw new SavedMixApiError(payload.error || 'Failed to load saved mixes', 'UNKNOWN');
  }
  return payload.data.mixes ?? [];
}

export async function createMix(payload: CreateMixPayload): Promise<SavedMix> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new SavedMixApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const name = payload.name?.trim() || generateMixName(payload.trackTitle);

  const response = await fetchWithAuthSession('/api/save-mix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      albumId: payload.albumId,
      trackId: payload.trackId,
      name,
      trackTitle: payload.trackTitle,
      albumTitle: payload.albumTitle ?? '',
      artistSlug: payload.artistSlug ?? '',
      settings: payload.settings,
    }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const data = (await response.json()) as ApiEnvelope<{ mix: SavedMix }>;
  if (!data.success || !data.data?.mix) {
    throw new SavedMixApiError(data.error || 'Failed to save mix', 'UNKNOWN');
  }
  return data.data.mix;
}

export async function deleteMix(mixId: string): Promise<void> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    throw new SavedMixApiError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const response = await fetchWithAuthSession('/api/delete-saved-mix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ mixId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}

export async function getSharedMix(mixId: string): Promise<SharedMix> {
  const response = await fetch(`/api/get-shared-mix?mixId=${encodeURIComponent(mixId)}`);

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ApiEnvelope<{ mix: SharedMix }>;
  if (!payload.success || !payload.data?.mix) {
    throw new SavedMixApiError(payload.error || 'Failed to load shared mix', 'UNKNOWN');
  }
  return payload.data.mix;
}
