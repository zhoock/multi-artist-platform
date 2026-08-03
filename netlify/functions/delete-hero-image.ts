/**
 * Netlify Serverless Function для удаления hero изображения и всех его вариантов из Supabase Storage
 *
 * Использование:
 * DELETE /api/delete-hero-image
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   imageUrl: string (URL изображения, например https://.../hero-123-1920.jpg или image-set(...))
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
import { extractBaseName } from './lib/image-processor';

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

interface DeleteHeroImageRequest {
  imageUrl: string;
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
    const body = parseJsonBody<Partial<DeleteHeroImageRequest>>(event.body, {});

    if (!body.imageUrl) {
      return createErrorResponse(400, 'Missing required field: imageUrl');
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(500, 'Failed to initialize Supabase client');
    }

    // Извлекаем базовое имя файла из URL
    // URL может быть:
    // 1. Proxy URL: /.netlify/functions/proxy-image?path=users%2F{userId}%2Fhero%2Fhero-123-1920.jpg
    // 2. Полный URL: https://.../users/.../hero/hero-123-1920.jpg
    // 3. image-set() строка: image-set(url('.../hero-123-1920.jpg') ...)
    // 4. Storage path: users/{userId}/hero/hero-123-1920.jpg
    let fileName = '';
    let storagePath = '';

    if (body.imageUrl.includes('proxy-image')) {
      // Извлекаем path из query параметра proxy-image URL
      const pathMatch = body.imageUrl.match(/[?&]path=([^&]+)/);
      if (pathMatch && pathMatch[1]) {
        try {
          storagePath = decodeURIComponent(pathMatch[1]);
          // Извлекаем имя файла из storage path
          fileName = storagePath.includes('/') ? storagePath.split('/').pop() || '' : storagePath;
        } catch (e) {
          console.error('Error decoding path from proxy-image URL:', e);
          return createErrorResponse(400, 'Invalid proxy-image URL format');
        }
      } else {
        return createErrorResponse(400, 'Could not extract path from proxy-image URL');
      }
    } else if (body.imageUrl.includes('image-set')) {
      // Извлекаем первый URL из image-set()
      const urlMatch = body.imageUrl.match(/url\(['"]([^'"]+)['"]\)/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        // Проверяем, это proxy URL или обычный URL
        if (url.includes('proxy-image')) {
          const pathMatch = url.match(/[?&]path=([^&]+)/);
          if (pathMatch && pathMatch[1]) {
            try {
              storagePath = decodeURIComponent(pathMatch[1]);
              fileName = storagePath.includes('/')
                ? storagePath.split('/').pop() || ''
                : storagePath;
            } catch (e) {
              return createErrorResponse(400, 'Invalid proxy-image URL in image-set');
            }
          }
        } else {
          // Извлекаем имя файла из URL
          fileName = url.includes('/') ? url.split('/').pop() || '' : url;
        }
      } else {
        return createErrorResponse(400, 'Invalid image-set() format');
      }
    } else if (body.imageUrl.startsWith('users/')) {
      // Это storage path напрямую
      storagePath = body.imageUrl;
      fileName = storagePath.includes('/') ? storagePath.split('/').pop() || '' : storagePath;
    } else if (body.imageUrl.includes('/')) {
      // Извлекаем имя файла из полного URL или пути
      fileName = body.imageUrl.split('/').pop() || '';
    } else {
      fileName = body.imageUrl;
    }

    if (!fileName) {
      return createErrorResponse(400, 'Could not extract file name from imageUrl');
    }

    // Извлекаем базовое имя (без расширения и суффиксов размеров)
    const baseName = extractBaseName(fileName);

    // Находим все варианты этого изображения в Storage
    // Используем UUID пользователя из токена
    const heroFolder = `users/${userId}/hero`;
    const { data: existingFiles, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .list(heroFolder, {
        limit: 100,
      });

    if (listError) {
      console.error('Error listing hero files:', listError);
      return createErrorResponse(500, `Failed to list files: ${listError.message}`);
    }

    if (!existingFiles || existingFiles.length === 0) {
      return createSuccessResponse(
        {
          success: true,
          message: 'No files to delete',
          deletedCount: 0,
        },
        200
      );
    }

    // Находим все файлы с таким же базовым именем
    const filesToDelete = existingFiles
      .filter((f) => {
        const fileBaseName = extractBaseName(f.name);
        return fileBaseName === baseName;
      })
      .map((f) => `${heroFolder}/${f.name}`);

    if (filesToDelete.length === 0) {
      return createSuccessResponse(
        {
          success: true,
          message: 'No variants found to delete',
          deletedCount: 0,
        },
        200
      );
    }

    // Удаляем все варианты
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .remove(filesToDelete);

    if (deleteError) {
      console.error('Error deleting hero image variants:', deleteError);
      return createErrorResponse(500, `Failed to delete files: ${deleteError.message}`);
    }

    return createSuccessResponse(
      {
        success: true,
        message: 'Hero image variants deleted successfully',
        deletedCount: filesToDelete.length,
        baseName,
      },
      200
    );
  } catch (error) {
    console.error('❌ Error in delete-hero-image:', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
};
