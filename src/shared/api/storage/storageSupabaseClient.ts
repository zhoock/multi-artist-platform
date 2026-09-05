/**
 * Supabase Storage operations that require @supabase/supabase-js client.
 * Not imported on the Hero / public URL critical path.
 */

import { createSupabaseClient, createSupabaseAdminClient } from '@config/supabase';
import { STORAGE_BUCKET_NAME } from '@config/supabaseStorageUrl';
import { getUserUserId, type ImageCategory } from '@config/user';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { getStorageErrorStatus } from '@shared/lib/errors/apiError';
import { getStoragePath } from '@shared/lib/storagePublicFileUrl';

import type { GetFileUrlOptions, UploadFileOptions } from './storageTypes';

export type { GetFileUrlOptions, UploadFileOptions };

function sanitizeUploadFileName(fileName: string): string {
  if (fileName.startsWith('users/')) {
    return fileName;
  }
  return sanitizeFileName(fileName);
}

export async function listStorageByPrefix(prefix: string): Promise<string[] | null> {
  try {
    const supabase = createSupabaseClient();
    if (!supabase) {
      console.error('Supabase client is not available. Please set required environment variables.');
      return null;
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .list(prefix, { limit: 1000 });

    if (error) {
      console.error('❌ [listStorageByPrefix] Error listing storage prefix:', {
        prefix,
        error: error.message,
        errorCode: getStorageErrorStatus(error),
        errorName: error.name,
      });
      return null;
    }

    const files = (data || []).filter((item) => item.id !== null);
    return files.map((item) => item.name);
  } catch (error) {
    console.error('❌ [listStorageByPrefix] Exception:', error);
    return null;
  }
}

export async function uploadFileAdmin(options: UploadFileOptions): Promise<string | null> {
  try {
    const {
      userId: explicitUserId,
      category,
      file,
      fileName: rawFileName,
      contentType,
      upsert = false,
    } = options;
    const fileName = sanitizeUploadFileName(rawFileName);
    const userId = explicitUserId;
    if (!userId) {
      console.error('[BUG] userId is missing in uploadFileAdmin.');
      return null;
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      console.error(
        'Supabase admin client is not available. Please set SUPABASE_SERVICE_ROLE_KEY environment variable.'
      );
      return null;
    }

    const storagePath = getStoragePath(userId, category, fileName);

    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).upload(storagePath, file, {
      contentType: contentType || (file instanceof File ? file.type : 'image/jpeg'),
      upsert,
      cacheControl: '3600',
    });

    if (error) {
      console.error('Error uploading file to Supabase Storage:', error);
      return null;
    }

    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadFileAdmin:', error);
    return null;
  }
}

export async function getStorageSignedUrl(options: GetFileUrlOptions): Promise<string | null> {
  try {
    const resolvedUserId = options.userId ?? getUserUserId();
    if (!resolvedUserId) {
      console.error('[BUG] userId is missing in getStorageSignedUrl.');
      return null;
    }
    const { category, fileName, expiresIn = 3600 } = options;
    const userId = resolvedUserId;

    const supabase = createSupabaseClient();
    if (!supabase) {
      console.error('Supabase client is not available. Please set required environment variables.');
      return null;
    }

    const storagePath = getStoragePath(userId, category, fileName);

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error in getStorageSignedUrl:', error);
    return null;
  }
}

export async function deleteStorageFile(
  userId: string,
  category: ImageCategory,
  fileName: string
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient();
    if (!supabase) {
      console.error('Supabase client is not available. Please set required environment variables.');
      return false;
    }

    const storagePath = getStoragePath(userId, category, fileName);

    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove([storagePath]);

    if (error) {
      console.error('Error deleting file from Supabase Storage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteStorageFile:', error);
    return false;
  }
}

export async function listStorageFiles(
  userId: string,
  category: ImageCategory
): Promise<string[] | null> {
  try {
    const supabase = createSupabaseClient();
    if (!supabase) {
      console.error('Supabase client is not available. Please set required environment variables.');
      return null;
    }

    const folderPath = `users/${userId}/${category}`;

    const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).list(folderPath);

    if (error) {
      console.error('Error listing files from Supabase Storage:', error);
      return null;
    }

    return data?.map((file) => file.name) || [];
  } catch (error) {
    console.error('Error in listStorageFiles:', error);
    return null;
  }
}
