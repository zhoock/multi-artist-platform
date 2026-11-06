/**
 * API для работы с Supabase Storage (upload/delete via Netlify + URL helpers).
 * Supabase JS client operations live in ./storageSupabaseClient.ts.
 */

import { buildStoragePublicObjectUrl } from '@config/supabaseStorageUrl';
import { getUserUserId } from '@config/user';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  buildProxyImageUrlFromStoragePath,
  normalizeProxyImageUrl,
} from '@shared/lib/proxyImageUrl';
import { compressHeroJpegForNetlifyPayload } from '@shared/lib/heroUploadPayload';
import { getPublicStorageFileUrl } from '@shared/lib/storagePublicFileUrl';

import type { GetFileUrlOptions, UploadFileOptions } from './storageTypes';

export type { GetFileUrlOptions, UploadFileOptions };
export { sanitizeFileName };
export { buildProxyImageUrlFromStoragePath, normalizeProxyImageUrl };
export { buildStoragePublicObjectUrl } from '@config/supabaseStorageUrl';

function sanitizeUploadFileName(fileName: string): string {
  if (fileName.startsWith('users/')) {
    return fileName;
  }
  return sanitizeFileName(fileName);
}

async function fileToBase64(file: File | Blob): Promise<string> {
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

function shouldBuildProxyUrlFromUploadResult(url: string): boolean {
  if (url.startsWith('users/')) {
    return true;
  }
  return !url.includes('proxy-image') && !url.includes('supabase.co');
}

export async function uploadFile(options: UploadFileOptions): Promise<string | null> {
  try {
    const resolvedUserId = options.userId ?? getUserUserId();
    if (!resolvedUserId) {
      console.error('[uploadFile] failure', {
        stage: 'auth',
        reason: 'missing_user_id',
        category: options.category,
      });
      return null;
    }
    const userId = resolvedUserId;
    const { category, file, fileName: rawFileName, contentType } = options;
    const fileName = sanitizeUploadFileName(rawFileName);

    let fileForUpload: Blob = file;

    if (category === 'hero') {
      try {
        fileForUpload = await compressHeroJpegForNetlifyPayload(file, {
          fileName,
          userId,
        });
      } catch (compressErr) {
        console.error('[uploadFile] hero compression failed', {
          stage: 'payload_size',
          category: 'hero',
          error: compressErr instanceof Error ? compressErr.message : String(compressErr),
        });
        throw compressErr;
      }
    }

    const fileSizeMB = fileForUpload.size / (1024 * 1024);

    if (fileSizeMB > 5) {
      console.warn(
        `⚠️ [uploadFile] Файл очень большой (${fileSizeMB.toFixed(2)}MB). Могут возникнуть проблемы с загрузкой через Netlify Function.`
      );
    }

    const { getToken } = await import('@shared/lib/auth');
    const token = getToken();
    if (!token) {
      console.error('[uploadFile] failure', {
        stage: 'auth',
        reason: 'missing_token',
        category,
      });
      return null;
    }

    const fileBase64 = await fileToBase64(fileForUpload);

    const { previousImageKey } = options;

    const payload: Record<string, unknown> = {
      fileBase64,
      fileName,
      userId,
      category,
      contentType:
        contentType ||
        (category === 'hero'
          ? 'image/jpeg'
          : file instanceof File && file.type
            ? file.type
            : 'image/jpeg'),
      originalFileSize: fileForUpload.size,
      originalFileName: file instanceof File ? file.name : undefined,
    };

    if (previousImageKey != null && String(previousImageKey).trim() !== '') {
      payload.previousImageKey = String(previousImageKey).trim();
    }

    const jsonBody = JSON.stringify(payload);
    const payloadJsonChars = jsonBody.length;
    const payloadSizeMB = payloadJsonChars / (1024 * 1024);

    if (payloadSizeMB > 5.5) {
      console.error('[uploadFile] failure', {
        stage: 'payload_size',
        category,
        payloadJsonChars,
        payloadSizeMB: Number(payloadSizeMB.toFixed(3)),
        fileBytes: fileForUpload.size,
        fileName,
      });
      throw new Error(
        `Файл слишком большой для загрузки через эту функцию (${(fileForUpload.size / (1024 * 1024)).toFixed(2)}MB). Максимальный размер: ~5MB.`
      );
    }

    let response: Response;
    try {
      response = await fetchWithAuthSession('/api/upload-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: jsonBody,
      });
    } catch (fetchErr) {
      console.error('[uploadFile] failure', {
        stage: 'fetch_network',
        category,
        fileName,
        payloadJsonChars,
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        name: fetchErr instanceof Error ? fetchErr.name : undefined,
      });
      return null;
    }

    const responseDiag = {
      status: response.status,
      ok: response.ok,
      redirected: response.redirected,
      type: response.type,
      url: response.url,
      contentType: response.headers.get('Content-Type'),
    };

    if (!response.ok) {
      let errorData: { error?: string; success?: boolean; code?: string; details?: string };
      try {
        errorData = await response.json();
      } catch {
        const text = await response.text().catch(() => 'Unable to read response');
        errorData = { error: `HTTP ${response.status}: ${text}` };
      }
      const serverMessage =
        typeof errorData?.error === 'string' ? errorData.error : JSON.stringify(errorData);
      console.error('[uploadFile] failure', {
        stage: 'http_error',
        category,
        ...responseDiag,
        statusText: response.statusText,
        serverMessage,
        serverCode: errorData?.code,
        serverDetails: errorData?.details,
        requestPayloadJsonChars: payloadJsonChars,
        fileName,
      });
      return null;
    }

    let result: { success?: boolean; data?: { url?: string }; error?: unknown };
    try {
      result = await response.json();
    } catch (parseErr) {
      const textPreview = await response.text().catch(() => '(no body)');
      console.error('[uploadFile] failure', {
        stage: 'response_json_parse',
        category,
        ...responseDiag,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
        bodyPreview: textPreview.slice(0, 500),
        fileName,
      });
      return null;
    }

    console.info('[uploadFile] response received', {
      category,
      fileName,
      ...responseDiag,
      success: result.success,
      hasDataUrl: Boolean(result.data?.url),
      serverError: result.error,
      requestPayloadJsonChars: payloadJsonChars,
    });

    if (!result.success || !result.data?.url) {
      console.error('[uploadFile] failure', {
        stage: 'server_body',
        category,
        ...responseDiag,
        success: result.success,
        serverError: result.error,
        fileName,
      });
      return null;
    }

    let finalUrl = result.data.url;

    if (category === 'hero' && shouldBuildProxyUrlFromUploadResult(finalUrl)) {
      finalUrl = buildProxyImageUrlFromStoragePath(finalUrl);
    }

    if (
      category === 'articles' &&
      typeof finalUrl === 'string' &&
      finalUrl.startsWith('users/') &&
      finalUrl.includes('/articles/') &&
      finalUrl.includes('article_cover_')
    ) {
      finalUrl = buildStoragePublicObjectUrl(finalUrl) ?? finalUrl;
    }

    if (
      category === 'profile' &&
      typeof finalUrl === 'string' &&
      finalUrl.startsWith('users/') &&
      finalUrl.includes('/profile/')
    ) {
      finalUrl = buildProxyImageUrlFromStoragePath(finalUrl);
    }

    return finalUrl;
  } catch (error) {
    console.error('[uploadFile] failure', {
      stage: 'exception',
      category: options.category,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
    });
    return null;
  }
}

export function buildProxyUrlFromPath(storagePath: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : process.env.NETLIFY_SITE_URL || '';
  return `${origin}/api/proxy-image?path=${encodeURIComponent(storagePath)}`;
}

/** @see getPublicStorageFileUrl — URL-only, без Supabase JS client. */
export function getStorageFileUrl(options: GetFileUrlOptions): string | null {
  return getPublicStorageFileUrl(options);
}

export async function deleteProfileAvatarFromServer(): Promise<boolean> {
  try {
    const { getAuthHeader, getToken } = await import('@shared/lib/auth');
    const token = getToken();
    if (!token) {
      console.error('[deleteProfileAvatarFromServer] Not authenticated');
      return false;
    }
    const authHeader = getAuthHeader();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeader,
    };
    if (!headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithAuthSession('/api/delete-profile-avatar', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[deleteProfileAvatarFromServer] HTTP error:', response.status, err);
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error('[deleteProfileAvatarFromServer]', error);
    return false;
  }
}

export async function deleteHeroImage(imageUrl: string): Promise<boolean> {
  try {
    const { getAuthHeader, getToken } = await import('@shared/lib/auth');
    const token = getToken();

    if (!token) {
      console.error('❌ [deleteHeroImage] Token not found. User is not authenticated.');
      return false;
    }

    const authHeader = getAuthHeader();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeader,
    };

    if (!headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithAuthSession('/api/delete-hero-image', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error deleting hero image:', errorData.error || response.statusText);
      return false;
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('Error in deleteHeroImage:', error);
    return false;
  }
}
