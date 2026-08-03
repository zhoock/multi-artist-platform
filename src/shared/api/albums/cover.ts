/**
 * API для работы с обложками альбомов (черновики и коммит)
 */

import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

type ApiError = {
  success: false;
  error: string;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type UploadCoverDraftResponse =
  | ApiSuccess<{
      draftKey: string;
      url: string;
      storagePath: string;
    }>
  | ApiError;

export type CommitCoverResponse =
  | ApiSuccess<{
      url: string;
      storagePath: string;
      baseName: string;
      variants: string[];
    }>
  | ApiError;

type CommitMeta = {
  artist: string;
  album: string;
  lang: 'ru' | 'en';
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isApiError(v: unknown): v is ApiError {
  return isObject(v) && v.success === false && typeof v.error === 'string' && v.error.length > 0;
}

function isUploadCoverDraftResponse(v: unknown): v is UploadCoverDraftResponse {
  if (!isObject(v) || typeof v.success !== 'boolean') return false;
  if (v.success === false) return isApiError(v);

  const data = (v as { data?: unknown }).data;
  return (
    isObject(data) &&
    typeof data.draftKey === 'string' &&
    typeof data.url === 'string' &&
    typeof data.storagePath === 'string'
  );
}

function isCommitCoverResponse(v: unknown): v is CommitCoverResponse {
  if (!isObject(v) || typeof v.success !== 'boolean') return false;
  if (v.success === false) return isApiError(v);

  const data = (v as { data?: unknown }).data;
  return (
    isObject(data) &&
    typeof data.url === 'string' &&
    typeof data.storagePath === 'string' &&
    typeof data.baseName === 'string' &&
    Array.isArray(data.variants) &&
    data.variants.every((x) => typeof x === 'string')
  );
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
 * Загружает обложку альбома в черновики
 */
export async function uploadCoverDraft(
  file: File,
  albumId?: string,
  artist?: string,
  album?: string,
  onProgress?: (progress: number) => void
): Promise<UploadCoverDraftResponse> {
  try {
    const token = getToken();
    if (!token) return { success: false, error: 'User is not authenticated. Please log in.' };

    onProgress?.(10);

    const fileBase64 = await fileToBase64(file);

    onProgress?.(50);

    // ✅ ходим через /api, а не напрямую в /.netlify/functions
    const response = await fetchWithAuthSession('/api/albums/cover/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileBase64,
        albumId,
        artist,
        album,
        contentType: file.type || 'image/jpeg',
        originalFileSize: file.size,
        originalFileName: file.name,
      }),
    });

    onProgress?.(90);

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (isApiError(json)) return json;
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    if (!isUploadCoverDraftResponse(json)) {
      return { success: false, error: 'Invalid response shape from upload-cover-draft' };
    }

    onProgress?.(100);
    return json;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Коммитит обложку из черновиков в финальный путь
 */
export async function commitCover(
  draftKey: string,
  albumId: string,
  meta: CommitMeta
): Promise<CommitCoverResponse> {
  try {
    const token = getToken();
    if (!token) return { success: false, error: 'User is not authenticated. Please log in.' };
    const response = await fetchWithAuthSession('/api/albums/cover/commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draftKey, albumId, ...meta }),
    });

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isApiError(json)) return json;
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    // Try to extract baseName even if type guard fails (for debugging)
    let extractedBaseName: string | undefined;
    if (isObject(json) && json.success && isObject(json.data)) {
      extractedBaseName = typeof json.data.baseName === 'string' ? json.data.baseName : undefined;
      if (!extractedBaseName && typeof json.data.storagePath === 'string') {
        // Fallback: extract from storagePath
        const pathParts = json.data.storagePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        if (fileName) {
          const match = fileName.match(/^(.+?)(?:-64|-128|-448|-896|-1344)(?:\.(jpg|webp))$/);
          if (match) {
            extractedBaseName = match[1];
          }
        }
      }
    }

    if (!isCommitCoverResponse(json)) {
      console.error('❌ commitCover: Invalid response shape', {
        response: json,
        expected: 'CommitCoverResponse with baseName: string',
        actual:
          isObject(json) && isObject(json.data)
            ? {
                hasBaseName: 'baseName' in json.data,
                baseNameType: typeof json.data.baseName,
                baseNameValue: json.data.baseName,
                extractedBaseName,
              }
            : 'not an object',
      });

      // If we successfully extracted baseName, return a valid response anyway
      if (extractedBaseName && isObject(json) && json.success && isObject(json.data)) {
        console.warn(
          '⚠️ commitCover: Type guard failed but extracted baseName, returning success anyway',
          {
            extractedBaseName,
            url: typeof json.data.url === 'string' ? json.data.url : undefined,
            storagePath:
              typeof json.data.storagePath === 'string' ? json.data.storagePath : undefined,
          }
        );
        return {
          success: true,
          data: {
            url: typeof json.data.url === 'string' ? json.data.url : '',
            storagePath: typeof json.data.storagePath === 'string' ? json.data.storagePath : '',
            baseName: extractedBaseName,
            variants: Array.isArray(json.data.variants)
              ? json.data.variants.filter((v): v is string => typeof v === 'string')
              : [],
          },
        };
      }

      return { success: false, error: 'Invalid response shape from commit-cover' };
    }
    return json;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
