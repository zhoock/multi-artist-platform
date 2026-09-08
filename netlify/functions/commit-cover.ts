/**
 * Netlify Serverless Function для коммита обложки из черновиков в финальный путь
 *
 * Использование:
 * POST /api/albums/cover/commit
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   draftKey: string (ключ черновика из upload-cover-draft),
 *   albumId: string (ID альбома)
 * }
 *
 * Возвращает:
 * {
 *   success: boolean,
 *   data?: {
 *     url: string (финальный URL обложки),
 *     storagePath: string (финальный путь в Storage)
 *   },
 *   error?: string
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
import { query } from './lib/db';
import { extractBaseName } from './lib/image-processor';

const STORAGE_BUCKET_NAME = 'user-media';

/** Суффиксы деривативов обложки в Storage (см. upload/commit pipeline). */
const COVER_SIZE_SUFFIXES = ['-64', '-128', '-448', '-896', '-1344'] as const;

/**
 * Из значения колонки `albums.cover` получает каноническое базовое имя файла (без размера и расширения).
 */
function normalizeCoverBaseName(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/\.(webp|jpg|jpeg)$/i, '');
  for (const suf of COVER_SIZE_SUFFIXES) {
    if (s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s.trim();
}

/**
 * Все ожидаемые пути объектов в bucket для одного базового имени обложки.
 */
function buildCoverVariantStoragePaths(userId: string, base: string): string[] {
  if (!base) return [];
  const prefix = `users/${userId}/albums`;
  const out: string[] = [];
  for (const sz of COVER_SIZE_SUFFIXES) {
    out.push(`${prefix}/${base}${sz}.webp`, `${prefix}/${base}${sz}.jpg`);
  }
  out.push(`${prefix}/${base}.webp`);
  return out;
}

async function fetchDistinctCoverBasesFromDb(userId: string, albumId: string): Promise<string[]> {
  try {
    const result = await query<{ cover: string | null }>(
      `SELECT DISTINCT cover FROM albums 
       WHERE user_id = $1 AND album_id = $2 
         AND cover IS NOT NULL AND trim(cover) <> ''`,
      [userId, albumId]
    );
    const bases = new Set<string>();
    for (const row of result.rows) {
      if (row.cover) {
        const b = normalizeCoverBaseName(row.cover);
        if (b) bases.add(b);
      }
    }
    return [...bases];
  } catch (e) {
    console.error('[commit-cover] Failed to read existing album.cover from DB:', e);
    return [];
  }
}

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

interface CommitCoverRequest {
  draftKey: string;
  albumId: string;
  artist?: string;
  album?: string;
  lang?: 'ru' | 'en';
}

interface CommitCoverResponse {
  success: boolean;
  data?: {
    url: string;
    storagePath: string;
    baseName?: string; // Базовое имя обложки (без расширения и суффиксов)
    variants?: string[]; // Список закоммиченных вариантов
  };
  error?: string;
}

/**
 * Получает финальный путь в Storage для обложки альбома
 * Использует UUID пользователя из токена
 */
function getFinalStoragePath(userId: string, albumId: string, fileExtension: string): string {
  // Используем UUID пользователя из токена
  return `users/${userId}/albums/${albumId}-cover.${fileExtension}`;
}

/**
 * Извлекает расширение файла из пути черновика
 */
function getFileExtensionFromPath(path: string): string {
  const match = path.match(/\.(jpg|jpeg|png|webp)$/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Проверяем авторизацию
    const userId = requireAuth(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    const { guardUserEmailVerifiedForUpload } = await import('./lib/email-verification');
    const emailGuardResponse = await guardUserEmailVerifiedForUpload(userId);
    if (emailGuardResponse) {
      return emailGuardResponse;
    }

    // Парсим JSON body
    const body = parseJsonBody<Partial<CommitCoverRequest>>(event.body, {});

    const { draftKey, albumId } = body;

    // Валидация полей
    if (!draftKey || !albumId) {
      return createErrorResponse(400, 'Missing required fields: draftKey, albumId');
    }

    // Проверяем, что draftKey принадлежит текущему пользователю
    if (!draftKey.startsWith(`${userId}/`)) {
      return createErrorResponse(403, 'Forbidden. Draft key does not belong to current user.');
    }

    // Создаём Supabase клиент с service role key
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(
        500,
        'Supabase admin client is not available. Please check environment variables.'
      );
    }

    // draftKey имеет формат: userId/albums/{albumId}/draft-cover или userId/albums/new/draft-cover
    // Для новых альбомов: userId/albums/new/draft-cover → drafts/userId/albums/new
    // Для существующих: userId/albums/{albumId}/draft-cover → drafts/userId/albums/{albumId}
    const draftKeyParts = draftKey.split('/');
    const draftFolder = `drafts/${draftKeyParts.slice(0, -1).join('/')}`;

    // Получаем список всех файлов в папке черновика
    const { data: draftFiles, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .list(draftFolder, {
        limit: 100,
      });

    if (listError || !draftFiles || draftFiles.length === 0) {
      console.error('Draft files not found:', {
        draftKey,
        draftFolder,
        error: listError?.message,
      });
      return createErrorResponse(404, 'Draft files not found');
    }

    // Фильтруем только файлы обложки (содержат "cover" в имени, case-insensitive)
    const coverFiles = draftFiles.filter((f) => f.name.toLowerCase().includes('cover'));

    if (coverFiles.length === 0) {
      console.error('No cover files found in draft folder:', draftFolder);
      return createErrorResponse(404, 'No cover files found in draft');
    }

    // Определяем базовое имя из первого файла
    // Формат файлов: Groupe-Cover-Album-Name-{suffix}
    // Нужно извлечь часть до первого суффикса (-64, -128, -448, -896, -1344)
    const firstFileName = coverFiles[0].name;

    // Извлекаем базовое имя, убирая все суффиксы
    // Паттерн: ищем последний суффикс перед расширением
    // Варианты суффиксов: -64, -128, -448, -896, -1344 (без @2x и @3x)
    const baseNameMatch = firstFileName.match(
      /^(.+?)(?:-64|-128|-448|-896|-1344)(?:\.(jpg|webp))$/
    );
    let finalBaseName: string;

    if (baseNameMatch) {
      // Используем извлеченное базовое имя
      finalBaseName = baseNameMatch[1];
    } else {
      // Fallback: пытаемся извлечь через extractBaseName и убрать суффиксы вручную
      let baseName = extractBaseName(firstFileName);

      // Убираем возможные суффиксы (новый формат без @2x и @3x)
      const beforeSuffix = baseName.replace(/(?:-64|-128|-448|-896|-1344)$/, '');
      finalBaseName = beforeSuffix || `${albumId}-cover`;
    }

    // Удаляем предыдущие файлы обложки в Storage по фактическому `albums.cover` в БД
    // (имя базы из нового черновика может отличаться — иначе старые объекты не находились).
    const oldBasesFromDb = await fetchDistinctCoverBasesFromDb(userId, albumId);
    const pathsToRemove = new Set<string>();
    for (const base of oldBasesFromDb) {
      for (const p of buildCoverVariantStoragePaths(userId, base)) {
        pathsToRemove.add(p);
      }
    }
    if (pathsToRemove.size > 0) {
      const list = [...pathsToRemove];
      const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(list);
      if (removeError) {
        console.warn(
          '[commit-cover] Some previous cover files could not be removed:',
          removeError.message
        );
      }
    }

    // Коммитим все варианты
    const committedFiles: string[] = [];
    const commitErrors: string[] = [];

    for (const draftFile of coverFiles) {
      const draftPath = `${draftFolder}/${draftFile.name}`;

      // Скачиваем файл из черновика
      const { data: draftData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .download(draftPath);

      if (downloadError || !draftData) {
        console.error(`Failed to download draft file ${draftFile.name}:`, downloadError?.message);
        commitErrors.push(`${draftFile.name}: ${downloadError?.message || 'Download failed'}`);
        continue;
      }

      // Извлекаем суффикс из имени файла (новый формат: "-64.webp", "-448.jpg", "-896.webp", "-1344.webp")
      const suffixMatch = draftFile.name.match(/(-\d+\.(jpg|webp))$/);
      const suffix = suffixMatch ? suffixMatch[0] : '';

      // Формируем финальное имя файла
      // Используем UUID пользователя из токена
      const finalFileName = suffix ? `${finalBaseName}${suffix}` : `${finalBaseName}.webp`;
      const finalPath = `users/${userId}/albums/${finalFileName}`;

      // Читаем данные файла
      const arrayBuffer = await draftData.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // Определяем Content-Type
      const contentType = finalFileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

      // Имена файлов содержат UUID (`album_cover_{uuid}_…`) — при замене обложки путь новый.
      // Длинный max-age безопасен: старые объекты удаляются commit-cover, клиент bust'ит по baseName.
      const COVER_VARIANT_CACHE_CONTROL = '31536000, immutable'; // 1 year (Supabase adds max-age= prefix)
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .upload(finalPath, fileBuffer, {
          contentType,
          upsert: true,
          cacheControl: COVER_VARIANT_CACHE_CONTROL,
        });

      if (uploadError) {
        console.error(`Error committing ${finalFileName}:`, uploadError.message);
        commitErrors.push(`${finalFileName}: ${uploadError.message}`);
      } else {
        committedFiles.push(finalFileName);
      }

      // Удаляем черновик после успешного коммита
      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .remove([draftPath]);

      if (deleteError) {
        console.warn(
          `Failed to delete draft ${draftFile.name} (non-critical):`,
          deleteError.message
        );
      }
    }

    if (committedFiles.length === 0) {
      return createErrorResponse(
        500,
        `Failed to commit any cover files: ${commitErrors.join(', ')}`
      );
    }

    if (commitErrors.length > 0) {
      console.warn(`Some files failed to commit: ${commitErrors.join(', ')}`);
    }

    // Получаем публичный URL базового файла для превью (используем 448.webp)
    // Используем UUID пользователя из токена
    const previewFileName = `${finalBaseName}-448.webp`;
    const previewPath = `users/${userId}/albums/${previewFileName}`;
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(previewPath);

    return createSuccessResponse(
      {
        url: urlData.publicUrl,
        storagePath: previewPath,
        baseName: finalBaseName,
        variants: committedFiles,
      },
      200
    );
  } catch (error) {
    console.error('❌ Error in commit-cover function:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      timestamp: new Date().toISOString(),
    });
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};
