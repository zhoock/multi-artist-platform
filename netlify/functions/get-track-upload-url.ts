/**
 * Netlify Function для получения signed URL для загрузки треков
 *
 * Использование:
 * POST /api/tracks/upload-url
 * Authorization: Bearer <token>
 * Body: { albumId: string, fileName: string }
 *
 * Возвращает:
 * {
 *   success: true,
 *   data: {
 *     signedUrl: string,
 *     storagePath: string,
 *     authUserId: string
 *   }
 * }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';

const STORAGE_BUCKET_NAME = 'user-media';

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase credentials not found');
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

interface GetUploadUrlRequest {
  albumId: string;
  fileName: string;
}

interface GetUploadUrlResponse {
  success: boolean;
  data?: {
    signedUrl: string;
    storagePath: string;
    authUserId: string;
  };
  error?: string;
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    // Парсим JSON body
    const body = parseJsonBody<Partial<GetUploadUrlRequest>>(event.body, {});

    const { albumId, fileName } = body;

    if (!albumId || !fileName) {
      return createErrorResponse(400, 'Missing required fields: albumId, fileName');
    }

    const storagePath = `users/${userId}/audio/${albumId}/original/${fileName}`;

    // Создаём Supabase клиент с service role key
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(500, 'Failed to create Supabase client');
    }

    // Генерируем signed URL для загрузки (действителен 1 час)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUploadUrl(storagePath, {
        upsert: true,
      });

    if (signedUrlError || !signedUrlData) {
      console.error('❌ Failed to create signed URL:', signedUrlError);
      return createErrorResponse(
        500,
        signedUrlError?.message || 'Failed to create signed upload URL'
      );
    }

    return createSuccessResponse(
      {
        signedUrl: signedUrlData.signedUrl,
        storagePath,
        authUserId: userId,
      },
      200
    );
  } catch (error) {
    console.error('❌ Error in get-track-upload-url function:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};
