// src/entities/stem/api/manifest.ts
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader } from '@shared/lib/auth';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { STEMS_MANIFEST_VERSION, type StemMeta, type StemsManifest } from '../model/types';
import type { StemsVisibility } from '@shared/lib/stems/stemsVisibility';

const MANIFEST_FILE = 'stems.json';
const MANIFEST_MIME = 'application/json';

/** Путь к папке с аудио стемами трека в bucket. */
export function getStemsFolderPath(userId: string, albumId: string, trackId: string): string {
  return `users/${userId}/audio/${albumId}/${trackId}`;
}

/** Полный путь к конкретному файлу стема. */
export function getStemStoragePath(
  userId: string,
  albumId: string,
  trackId: string,
  fileName: string
): string {
  return `${getStemsFolderPath(userId, albumId, trackId)}/${fileName}`;
}

export type LoadStemsResult = {
  stems: StemMeta[];
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  /** Manifest exists but viewer lacks stem access (403/401). */
  accessDenied?: boolean;
};

function buildStemsApiUrl(endpoint: 'manifest' | 'audio', params: URLSearchParams): string {
  return `/api/stems/${endpoint}?${params.toString()}`;
}

/** Protected stem audio URL (no direct Supabase public URLs). */
export function getStemAudioUrl(
  artistUserId: string,
  albumId: string,
  trackId: string,
  stem: StemMeta,
  accessToken: string | null,
  accessTokenExpiresAt: number | null
): string | null {
  if (!artistUserId?.trim() || !stem.file?.trim()) return null;
  if (!accessToken || accessTokenExpiresAt == null) return null;

  const params = new URLSearchParams({
    artistUserId,
    albumId,
    trackId,
    file: stem.file,
    accessToken,
    expiresAt: String(accessTokenExpiresAt),
  });

  return buildStemsApiUrl('audio', params);
}

async function getAuthToken(): Promise<string> {
  const { getToken } = await import('@shared/lib/auth');
  const token = getToken();
  if (!token) {
    throw new Error('Пользователь не авторизован');
  }
  return token;
}

async function getSignedUploadUrl(
  albumId: string,
  trackId: string,
  fileName: string
): Promise<{ signedUrl: string; storagePath: string }> {
  const token = await getAuthToken();
  const response = await fetchWithAuthSession('/api/stems/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ albumId, trackId, fileName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Не удалось получить URL для загрузки');
  }

  const { data } = await response.json();
  if (!data?.signedUrl || !data?.storagePath) {
    throw new Error('Некорректный ответ от сервера');
  }
  return { signedUrl: data.signedUrl, storagePath: data.storagePath };
}

async function putToSignedUrl(
  signedUrl: string,
  body: Blob | File,
  contentType: string
): Promise<void> {
  const formData = new FormData();
  formData.append('cacheControl', '3600');
  formData.append(
    '',
    body instanceof File ? body : new File([body], 'upload', { type: contentType })
  );

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'true' },
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Ошибка загрузки: ${response.status}${errorText ? ` — ${errorText.slice(0, 200)}` : ''}`
    );
  }
}

/** Загрузить аудиофайл стема. Возвращает имя файла в Storage. */
export async function uploadStemAudio(
  albumId: string,
  trackId: string,
  file: File
): Promise<{ fileName: string }> {
  const fileExt = file.name.split('.').pop() || 'wav';
  const fileName = `stem-${uniqueUploadFileSuffix()}.${fileExt}`;
  const { signedUrl } = await getSignedUploadUrl(albumId, trackId, fileName);
  await putToSignedUrl(signedUrl, file, file.type || 'audio/wav');
  return { fileName };
}

/** Синхронизирует tracks.has_stems после записи манифеста (CatalogAlbum / Mixer). */
async function syncTrackHasStems(
  albumId: string,
  trackId: string,
  hasStems: boolean
): Promise<void> {
  try {
    const token = await getAuthToken();
    const response = await fetchWithAuthSession('/api/stems/has-stems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ albumId, trackId, hasStems }),
    });
    if (!response.ok) {
      console.warn('[saveStemsManifest] Failed to sync has_stems:', response.status);
    }
  } catch (error) {
    console.warn('[saveStemsManifest] Failed to sync has_stems:', error);
  }
}

/** Сохранить манифест стемов трека (перезаписывает stems.json). */
export async function saveStemsManifest(
  albumId: string,
  trackId: string,
  stems: StemMeta[]
): Promise<void> {
  const manifest: StemsManifest = { version: STEMS_MANIFEST_VERSION, stems };
  const file = new File([JSON.stringify(manifest, null, 2)], MANIFEST_FILE, {
    type: MANIFEST_MIME,
  });
  const { signedUrl } = await getSignedUploadUrl(albumId, trackId, MANIFEST_FILE);
  await putToSignedUrl(signedUrl, file, MANIFEST_MIME);
  await syncTrackHasStems(albumId, trackId, stems.length > 0);
  const { notifyPublicSurfaceChanged } = await import('@shared/lib/publicSurfaceSync');
  notifyPublicSurfaceChanged({ type: 'stemsChanged', albumId });
}

/** Удалить файл стема из Storage. */
export async function deleteStemFile(storagePath: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetchWithAuthSession('/api/stems/delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ storagePath }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

/** POST: обновить видимость стемов трека (независимо от track.visibility). */
export async function updateStemsVisibility(
  albumId: string,
  trackId: string,
  visibility: StemsVisibility
): Promise<void> {
  const token = await getAuthToken();
  const response = await fetchWithAuthSession('/api/update-stems-visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ albumId, trackId, visibility }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { message?: string }).message || `HTTP ${response.status}`);
  }
}

/** Загрузить список стемов трека через protected API. */
export async function loadStems(
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<LoadStemsResult> {
  const empty: LoadStemsResult = { stems: [], accessToken: null, accessTokenExpiresAt: null };

  if (!artistUserId?.trim() || !albumId?.trim() || !trackId?.trim()) {
    return empty;
  }

  const params = new URLSearchParams({
    artistUserId,
    albumId,
    trackId,
  });

  try {
    const response = await fetchWithAuthSession(buildStemsApiUrl('manifest', params), {
      cache: 'no-store',
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 403 || response.status === 401) {
      return { ...empty, accessDenied: true };
    }

    if (!response.ok) {
      return empty;
    }

    const payload = (await response.json()) as ApiEnvelope<{
      stems: StemMeta[];
      accessToken: string;
      accessTokenExpiresAt: number;
    }>;

    if (!payload.success || !payload.data) {
      return empty;
    }

    return {
      stems: Array.isArray(payload.data.stems) ? payload.data.stems : [],
      accessToken: payload.data.accessToken ?? null,
      accessTokenExpiresAt: payload.data.accessTokenExpiresAt ?? null,
    };
  } catch {
    return empty;
  }
}
