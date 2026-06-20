/**
 * Netlify Serverless Function для удаления стема из Supabase Storage
 *
 * Использование:
 * DELETE /api/stems/delete
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   storagePath: string (путь к файлу, например "users/{userId}/audio/albumId/trackId/fileName.mp3")
 * }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';
import { assertOwnedStemStoragePath, StemStoragePathError } from './lib/stem-storage-path';

const STORAGE_BUCKET_NAME = 'user-media';

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase credentials not found', {
      hasUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    });
    return null;
  }

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.error('❌ Failed to create Supabase admin client:', error);
    return null;
  }
}

interface DeleteStemRequest {
  storagePath: string;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Проверяем авторизацию
    const userId = requireAuth(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    // Парсим JSON body (default пустой: поля проверяем ниже)
    const body = parseJsonBody<Partial<DeleteStemRequest>>(event.body, {});

    if (!body.storagePath) {
      return createErrorResponse(400, 'Missing required field: storagePath');
    }

    let ownedStoragePath: string;
    try {
      ownedStoragePath = assertOwnedStemStoragePath(body.storagePath, userId);
    } catch (error) {
      if (error instanceof StemStoragePathError) {
        return createErrorResponse(error.statusCode, error.message);
      }
      throw error;
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(500, 'Failed to initialize Supabase client');
    }

    console.log('🗑️ [delete-stem] Deleting stem file:', ownedStoragePath);

    // Удаляем файл из Storage
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .remove([ownedStoragePath]);

    if (deleteError) {
      console.error('❌ [delete-stem] Error deleting file from Storage:', deleteError);
      return createErrorResponse(500, `Failed to delete file: ${deleteError.message}`);
    }

    console.log('✅ [delete-stem] File successfully deleted from Storage:', ownedStoragePath);

    return createSuccessResponse(
      {
        success: true,
        message: 'Stem file deleted successfully',
        storagePath: ownedStoragePath,
      },
      200
    );
  } catch (error) {
    console.error('❌ [delete-stem] Error:', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
};
