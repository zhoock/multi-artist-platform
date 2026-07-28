/**
 * API для работы с треками
 */

import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  audioContainerToExtension,
  type AudioTechnicalMetadata,
} from '@shared/lib/audio/audioTechnicalMetadata';
import { extractAudioTechnicalMetadata } from '@shared/lib/audio/extractAudioTechnicalMetadata';
import { buildStorageAudioFileName } from '@shared/lib/tracks/buildStorageAudioFileName';
import type { SupportedLang } from '@shared/model/lang';

export interface TrackUploadData extends AudioTechnicalMetadata {
  fileName: string;
  duration: number;
  trackId: string;
  orderIndex?: number;
  storagePath: string;
  masterPath?: string;
  url: string;
  translations: Partial<Record<SupportedLang, { title: string }>>;
}

export interface TrackUploadRequest {
  albumId: string; // album_id (строка, например "23"), не UUID
  lang: string; // 'ru' или 'en'
  tracks: TrackUploadData[];
}

export interface TrackUploadResponse {
  success: boolean;
  data?: Array<{
    trackId: string;
    title: string;
    url: string;
    storagePath: string;
  }>;
  error?: string;
}

/**
 * Конвертирует File в base64 строку (без префикса data:...)
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Получает длительность аудиофайла в секундах
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });

    audio.addEventListener('error', (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio metadata'));
    });

    audio.src = url;
  });
}

/**
 * Загружает треки в базу данных
 */
export async function uploadTracks(
  albumId: string,
  lang: string,
  tracks: TrackUploadData[]
): Promise<TrackUploadResponse> {
  try {
    const token = getToken();
    if (!token) {
      return { success: false, error: 'User is not authenticated. Please log in.' };
    }

    const response = await fetchWithAuthSession('/api/tracks/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        albumId,
        lang,
        tracks,
      }),
    });

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (typeof json === 'object' && json !== null && 'error' in json) {
        return { success: false, error: (json as { error: string }).error };
      }
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    if (
      typeof json === 'object' &&
      json !== null &&
      'success' in json &&
      (json as { success: unknown }).success === true &&
      'data' in json
    ) {
      let data = (json as { data: unknown }).data;
      // Старый баг бэкенда: data был { success: true, data: [...] } вместо массива.
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        'data' in (data as object) &&
        Array.isArray((data as { data: unknown }).data)
      ) {
        data = (data as { data: TrackUploadResponse['data'] }).data;
      }
      if (!Array.isArray(data)) {
        return { success: false, error: 'Invalid response shape from upload-tracks' };
      }
      return { success: true, data };
    }

    return { success: false, error: 'Invalid response shape from upload-tracks' };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Подготавливает и загружает трек напрямую в Supabase Storage
 * Загружает файл напрямую, минуя Netlify Functions, чтобы избежать проблем с размером
 */
export async function prepareAndUploadTrack(
  file: File,
  albumId: string,
  trackId: string,
  options?: { title?: string; lang: SupportedLang }
): Promise<TrackUploadData> {
  const lang = options?.lang ?? 'ru';
  const titleOpt = options?.title;
  const { createSupabaseClient, STORAGE_BUCKET_NAME } = await import('@config/supabase');
  const { getToken } = await import('@shared/lib/auth');

  const token = getToken();
  if (!token) {
    throw new Error('User is not authenticated. Please log in.');
  }

  const [browserDuration, audioTech] = await Promise.all([
    getAudioDuration(file),
    extractAudioTechnicalMetadata(file),
  ]);
  // Probe duration предпочтительнее HTMLAudioElement; оба пишутся (duration + audioDuration).
  const duration = audioTech.audioDuration ?? Math.round(browserDuration * 100) / 100;

  const fileName = buildStorageAudioFileName(trackId, file.name, {
    extensionFromContent: audioContainerToExtension(audioTech.audioContainer),
  });

  // Извлекаем название трека из имени файла
  // Убираем расширение и префиксы типа "01-", "03-" и т.д.
  let trackTitle = titleOpt;
  if (!trackTitle) {
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    console.log('📝 [prepareAndUploadTrack] Extracting title from filename:', {
      originalFileName: file.name,
      fileNameWithoutExt,
    });

    // Убираем префиксы типа "01-", "03-", "1-", "10-" и т.д. в начале названия
    // Паттерн: опциональный номер (1-2 цифры), затем дефис, точка или пробел
    trackTitle = fileNameWithoutExt.replace(/^\d{1,2}[-.\s]+/i, '').trim();

    // Если после удаления префикса ничего не осталось, используем оригинальное имя
    if (!trackTitle) {
      trackTitle = fileNameWithoutExt;
    }

    console.log('📝 [prepareAndUploadTrack] Extracted title:', {
      originalFileName: file.name,
      extractedTitle: trackTitle,
    });
  } else {
    console.log('📝 [prepareAndUploadTrack] Using provided title:', trackTitle);
  }

  if (!titleOpt) {
    const rawBase = file.name.replace(/\.[^/.]+$/, '').trim();
    if (/^\d+(\.[a-z0-9]+)?$/i.test(trackTitle)) {
      const cleaned = rawBase.replace(/^\d{1,2}[-.\s]+/i, '').trim() || rawBase;
      trackTitle = /^\d+$/i.test(cleaned) || !cleaned ? `Track ${trackId}` : cleaned;
    }
  }

  // Получаем signed URL для загрузки через Netlify Function
  // Это обходит проблему с кастомным токеном (не Supabase JWT)
  const signedUrlResponse = await fetchWithAuthSession('/api/tracks/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      albumId,
      fileName,
    }),
  });

  if (!signedUrlResponse.ok) {
    const errorData = await signedUrlResponse.json().catch(() => ({}));
    console.error('❌ [prepareAndUploadTrack] Failed to get signed URL:', errorData);
    throw new Error(errorData.error || 'Failed to get upload URL. Please try again.');
  }

  const { data: signedUrlData } = await signedUrlResponse.json();
  if (!signedUrlData?.signedUrl || !signedUrlData?.storagePath || !signedUrlData?.authUserId) {
    console.error('❌ [prepareAndUploadTrack] Invalid signed URL response:', signedUrlData);
    throw new Error('Invalid response from server. Please try again.');
  }

  const { signedUrl, storagePath, authUserId } = signedUrlData;

  console.log('🔐 [prepareAndUploadTrack] Got signed URL for upload:', {
    authUserId,
    storagePath,
    hasSignedUrl: !!signedUrl,
  });

  const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
  console.log('📤 [prepareAndUploadTrack] Starting upload:', {
    fileName,
    storagePath,
    fileSize: `${fileSizeMB} MB`,
    fileType: file.type,
    albumId,
    trackId,
  });

  // Для больших файлов (>50MB) добавляем предупреждение
  if (file.size > 50 * 1024 * 1024) {
    console.warn('⚠️ [prepareAndUploadTrack] Large file detected:', {
      fileSize: `${fileSizeMB} MB`,
      note: 'This may take a while. Supabase Storage has a 50MB limit per file for free tier.',
    });
  }

  // Создаем AbortController для таймаута (10 минут для больших файлов)
  const controller = new AbortController();
  const timeoutMs = file.size > 50 * 1024 * 1024 ? 10 * 60 * 1000 : 5 * 60 * 1000; // 10 мин для больших, 5 мин для обычных
  const timeoutId = setTimeout(() => {
    console.error('⏱️ [prepareAndUploadTrack] Upload timeout after', timeoutMs / 1000, 'seconds');
    controller.abort();
  }, timeoutMs);

  try {
    console.log('🔄 [prepareAndUploadTrack] Uploading to Supabase Storage via signed URL...');
    const uploadStartTime = Date.now();

    // Supabase Storage signed upload ожидает тот же формат, что и
    // storage-js uploadToSignedUrl: multipart FormData + x-upsert (не сырой PUT body).
    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', file);

    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'x-upsert': 'true',
      },
      body: formData,
      signal: controller.signal,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      console.error('❌ [prepareAndUploadTrack] Upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText,
      });
      throw new Error(
        `Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`
      );
    }

    clearTimeout(timeoutId);
    const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
    console.log(`⏱️ [prepareAndUploadTrack] Upload completed in ${uploadDuration}s`);

    console.log('✅ [prepareAndUploadTrack] File uploaded successfully:', {
      fileName,
      storagePath,
    });

    const { buildStoragePublicObjectUrl } = await import('@config/supabase');
    const publicUrl = buildStoragePublicObjectUrl(storagePath);

    if (!publicUrl) {
      console.warn('⚠️ VITE_SUPABASE_URL is missing. Falling back to storagePath:', {
        storagePath,
      });

      return {
        fileName,
        duration,
        trackId,
        storagePath,
        masterPath: storagePath,
        url: storagePath,
        translations: { [lang]: { title: trackTitle } },
        ...audioTech,
        audioDuration: audioTech.audioDuration ?? duration,
      };
    }

    console.log('✅ [prepareAndUploadTrack] Got public URL:', {
      fileName,
      url: publicUrl,
      audioTech,
    });

    return {
      fileName,
      duration,
      trackId,
      storagePath,
      masterPath: storagePath,
      url: publicUrl,
      translations: { [lang]: { title: trackTitle } },
      ...audioTech,
      audioDuration: audioTech.audioDuration ?? duration,
    };
  } catch (uploadError) {
    clearTimeout(timeoutId);
    if (uploadError instanceof Error && uploadError.name === 'AbortError') {
      throw new Error(
        `Upload timeout: File is too large (${fileSizeMB} MB) or connection is too slow. Try a smaller file or check your connection.`
      );
    }
    throw uploadError;
  }
}
