// src/entities/stem/api/manifest.ts
import {
  buildStoragePublicObjectUrl,
  createSupabaseClient,
  STORAGE_BUCKET_NAME,
} from '@config/supabase';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { STEMS_MANIFEST_VERSION, type StemMeta, type StemsManifest } from '../model/types';
import { isStemCategory } from '../lib/category';

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

/** Публичный URL объекта в bucket (для воспроизведения / чтения манифеста). */
export function resolveStoragePublicUrl(storagePath: string): string | null {
  const built = buildStoragePublicObjectUrl(storagePath);
  if (built) return built;
  const supabase = createSupabaseClient();
  if (supabase) {
    const { data } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
  }
  return null;
}

/** Готовый публичный URL аудиофайла стема. */
export function getStemAudioUrl(
  userId: string,
  albumId: string,
  trackId: string,
  stem: StemMeta
): string | null {
  return resolveStoragePublicUrl(getStemStoragePath(userId, albumId, trackId, stem.file));
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
  // Supabase signed upload expects multipart FormData + x-upsert (same as track uploads).
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

/** Разобрать одну запись стема. Без валидной category запись отклоняется. */
function parseStemMeta(raw: unknown): StemMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (!isStemCategory(record.category)) return null;
  if (typeof record.file !== 'string' || !record.file.trim()) return null;
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    file: record.file,
    size: typeof record.size === 'number' ? record.size : undefined,
    originalFileName:
      typeof record.originalFileName === 'string' ? record.originalFileName : undefined,
  };
}

/** Разобрать манифест формата { version, stems: [...] }. */
function parseManifest(parsed: unknown): StemMeta[] | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { stems } = parsed as { stems?: unknown };
  if (!Array.isArray(stems)) return null;
  return stems.map(parseStemMeta).filter((s): s is StemMeta => s !== null);
}

/** Загрузить список стемов трека из stems.json. */
export async function loadStems(
  userId: string,
  albumId: string,
  trackId: string
): Promise<StemMeta[]> {
  const folderPath = getStemsFolderPath(userId, albumId, trackId);
  const manifestUrl = resolveStoragePublicUrl(`${folderPath}/${MANIFEST_FILE}`);
  if (!manifestUrl) return [];

  try {
    const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const parsed = (await response.json()) as unknown;
    return parseManifest(parsed) ?? [];
  } catch {
    return [];
  }
}
