/**
 * Netlify Serverless Function для загрузки файлов в Supabase Storage
 *
 * Использование:
 * POST /api/upload-file
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   fileBase64: string (base64 encoded file),
 *   fileName: string,
 *   userId?: string (опционально, по умолчанию из токена),
 *   category: 'albums' | 'articles' | 'profile' | 'uploads' | 'stems',
 *   — profile + fileName `profile.jpg|png|webp`: сервер генерирует квадратные 128/256 (webp+jpeg), уникальный префикс `profile-<hex>`, канонический URL — `.../profile-<hex>-128.webp`.
 *   contentType?: string (опционально, по умолчанию 'image/jpeg')
 * }
 */

import { randomBytes } from 'crypto';
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import type { ImageCategory } from '../../src/config/user';
import { extractRoleFromToken } from './lib/jwt';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';
import { getStorageErrorStatus } from './lib/error-utils';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './lib/supabase';
import { sanitizeUploadFileName } from './lib/sanitizeFileName';
import {
  generateHeroImageVariants,
  generateArticleCoverVariants,
  generateProfileAvatarVariants,
  extractBaseName,
  ARTICLE_COVER_CACHE_CONTROL,
} from './lib/image-processor';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  isProfileAvatarStorageObjectName,
} from '../../src/shared/lib/avatarUpload';

const ALLOWED_CATEGORIES: readonly ImageCategory[] = [
  'albums',
  'articles',
  'profile',
  'uploads',
  'stems',
  'audio',
  'hero',
];

function normalizeImageCategory(raw: unknown): ImageCategory | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === 'article') return 'articles';
  if ((ALLOWED_CATEGORIES as readonly string[]).includes(s)) return s as ImageCategory;
  return null;
}

interface UploadFileRequest {
  fileBase64: string;
  fileName: string;
  userId?: string;
  category: ImageCategory;
  contentType?: string;
  originalFileSize?: number; // Размер оригинального файла для проверки
  originalFileName?: string; // Имя оригинального файла для логирования
  /** Ключ предыдущей обложки в БД — удалить все объекты Storage с этим baseName (другой суффикс, чем у новой загрузки) */
  previousImageKey?: string;
}

interface UploadFileResponse {
  success: boolean;
  url?: string;
  error?: string;
}

function getStoragePath(userId: string, category: ImageCategory, fileName: string): string {
  // Используем UUID пользователя для всех категорий
  // Это обеспечивает правильную изоляцию данных для мультипользовательской системы
  return `users/${userId}/${category}/${fileName}`;
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

    const { isUserEmailVerified } = await import('./lib/email-verification');
    if (!(await isUserEmailVerified(userId))) {
      return createErrorResponse(403, 'Email verification required', undefined, {
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Парсим JSON body
    const body = parseJsonBody<Partial<UploadFileRequest>>(event.body, {});

    const {
      fileBase64,
      fileName: rawFileName,
      category: categoryRaw,
      contentType,
      originalFileSize,
      previousImageKey: previousImageKeyRaw,
    } = body;

    if (!fileBase64 || !rawFileName || !categoryRaw) {
      return createErrorResponse(400, 'Missing required fields: fileBase64, fileName, category');
    }

    const fileName = sanitizeUploadFileName(String(rawFileName).trim());

    const normalizedCategory = normalizeImageCategory(categoryRaw);
    if (!normalizedCategory) {
      return createErrorResponse(
        400,
        `Invalid category "${String(categoryRaw)}". Use: ${ALLOWED_CATEGORIES.join(', ')} (alias: article → articles)`
      );
    }

    // Используем userId из токена или из запроса (если указан)
    const targetUserId = body.userId || userId;

    const authHeader =
      (event.headers?.authorization as string | undefined) ||
      (event.headers?.Authorization as string | undefined) ||
      ((event as any).clientContext?.user?.token as string | undefined);
    const isAdmin = extractRoleFromToken(authHeader) === 'admin';

    // Своя папка или загрузка админом в папку другого пользователя
    if (targetUserId !== userId && !isAdmin) {
      return createErrorResponse(403, 'Forbidden. You can only upload to your own folder.');
    }

    // Создаём Supabase клиент с service role key (обходит RLS)
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(
        500,
        'Uploads require SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env for Netlify Functions.'
      );
    }

    // Декодируем base64 в Buffer
    const startDecode = Date.now();
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const decodeTime = Date.now() - startDecode;

    // Проверяем размер файла
    const receivedSize = fileBuffer.length;
    if (originalFileSize && Math.abs(receivedSize - originalFileSize) > 100) {
      console.warn('File size mismatch:', {
        originalFileSize,
        receivedSize,
        difference: Math.abs(receivedSize - originalFileSize),
      });
    }

    if (normalizedCategory === 'profile' && receivedSize > AVATAR_MAX_FILE_SIZE_BYTES) {
      return createErrorResponse(
        400,
        `Avatar file is too large. Maximum size is ${AVATAR_MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
      );
    }

    // Для категории hero генерируем варианты изображений
    if (normalizedCategory === 'hero') {
      // Используем UUID пользователя из токена
      const heroUserId = userId;

      // Извлекаем базовое имя файла (без расширения)
      const baseName = extractBaseName(fileName);

      const variants = await generateHeroImageVariants(fileBuffer, baseName);

      // Удаляем старые варианты этого изображения (если есть)
      const heroFolder = `users/${heroUserId}/hero`;
      const { data: existingFiles } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .list(heroFolder, {
          limit: 100,
        });

      if (existingFiles && existingFiles.length > 0) {
        // Находим все файлы с таким же базовым именем
        const oldFiles = existingFiles
          .filter((f) => {
            const fileBaseName = extractBaseName(f.name);
            return fileBaseName === baseName;
          })
          .map((f) => `${heroFolder}/${f.name}`);

        if (oldFiles.length > 0) {
          await supabase.storage.from(STORAGE_BUCKET_NAME).remove(oldFiles);
        }
      }

      // Загружаем все варианты
      const uploadedFiles: string[] = [];
      const uploadErrors: string[] = [];

      for (const [variantFileName, buffer] of Object.entries(variants)) {
        const variantPath = getStoragePath(heroUserId, normalizedCategory, variantFileName);
        const variantContentType = variantFileName.endsWith('.avif')
          ? 'image/avif'
          : variantFileName.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';

        const { data: variantData, error: variantError } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .upload(variantPath, buffer, {
            contentType: variantContentType,
            upsert: true,
            cacheControl: '3600', // Кеш на 1 час
          });

        if (variantError) {
          console.error(`Error uploading variant ${variantFileName}:`, variantError.message);
          uploadErrors.push(`${variantFileName}: ${variantError.message}`);
        } else {
          uploadedFiles.push(variantFileName);
        }
      }

      if (uploadErrors.length > 0) {
        console.error('Some hero image variants failed to upload:', uploadErrors);
        if (uploadedFiles.length === 0) {
          return createErrorResponse(
            500,
            `Failed to upload any hero image variants: ${uploadErrors.join(', ')}`
          );
        }
      }

      // Используем -1920.jpg как основной файл (Full HD версия)
      const mainFileName = `${baseName}-1920.jpg`;
      const mainPath = getStoragePath(heroUserId, normalizedCategory, mainFileName);

      // Для hero изображений возвращаем storagePath, клиент сформирует URL через getStorageFileUrl
      // Это более надежно, чем формировать URL на сервере

      // Генерируем proxy URL на клиенте через getStorageFileUrl
      // Возвращаем storagePath, который клиент использует для генерации URL
      return createSuccessResponse(
        {
          url: mainPath, // Возвращаем storagePath, клиент сформирует proxy URL
          storagePath: mainPath,
          baseName,
        },
        200
      );
    }

    // Обложка статьи (article_cover_*): варианты -128 / -448 / -896 / -1344 (webp + jpg), canonical 3:2
    if (normalizedCategory === 'articles' && fileName.startsWith('article_cover_')) {
      const articleUserId = targetUserId;
      const baseName = extractBaseName(fileName);

      const variants = await generateArticleCoverVariants(fileBuffer, baseName);

      const articlesFolder = `users/${articleUserId}/articles`;
      const { data: existingArticleFiles } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .list(articlesFolder, {
          limit: 1000,
        });

      const pathsToDelete = new Set<string>();

      const addFilesMatchingBase = (targetBase: string) => {
        if (!existingArticleFiles?.length || !targetBase) return;
        for (const f of existingArticleFiles) {
          if (extractBaseName(f.name) === targetBase) {
            pathsToDelete.add(`${articlesFolder}/${f.name}`);
          }
        }
      };

      // Замена обложки: новый файл имеет другой baseName — удаляем объекты старого ключа
      if (
        previousImageKeyRaw != null &&
        typeof previousImageKeyRaw === 'string' &&
        previousImageKeyRaw.trim() !== ''
      ) {
        const prevSanitized = sanitizeUploadFileName(previousImageKeyRaw.trim());
        if (prevSanitized.startsWith('article_cover_')) {
          const prevBase = extractBaseName(prevSanitized);
          if (prevBase && prevBase !== baseName) {
            addFilesMatchingBase(prevBase);
          }
        }
      }

      // Перезапись того же base (повторная загрузка) или мусор с тем же именем
      addFilesMatchingBase(baseName);

      if (pathsToDelete.size > 0) {
        const pathsArray = [...pathsToDelete];
        await supabase.storage.from(STORAGE_BUCKET_NAME).remove(pathsArray);
      }

      const uploadedArticleFiles: string[] = [];
      const uploadArticleErrors: string[] = [];

      for (const [variantFileName, buffer] of Object.entries(variants)) {
        const variantPath = getStoragePath(articleUserId, 'articles', variantFileName);
        const variantContentType = variantFileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

        const { error: variantError } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .upload(variantPath, buffer, {
            contentType: variantContentType,
            upsert: true,
            cacheControl: ARTICLE_COVER_CACHE_CONTROL,
          });

        if (variantError) {
          console.error(
            `Error uploading article cover variant ${variantFileName}:`,
            variantError.message
          );
          uploadArticleErrors.push(`${variantFileName}: ${variantError.message}`);
        } else {
          uploadedArticleFiles.push(variantFileName);
        }
      }

      if (uploadArticleErrors.length > 0) {
        console.error('Some article cover variants failed to upload:', uploadArticleErrors);
        if (uploadedArticleFiles.length === 0) {
          return createErrorResponse(
            500,
            `Failed to upload any article cover variants: ${uploadArticleErrors.join(', ')}`
          );
        }
      }

      const previewPath = getStoragePath(articleUserId, 'articles', `${baseName}-448.webp`);

      return createSuccessResponse(
        {
          url: previewPath,
          storagePath: previewPath,
          baseName,
        },
        200
      );
    }

    /** Аватар (только `profile.jpg|png|webp`): квадратные 128/256, без сохранения оригинала. Обложки `cover-*` — ниже, как один файл. */
    const isProfileAvatarUpload =
      normalizedCategory === 'profile' && /^profile\.(jpe?g|png|webp)$/i.test(fileName);

    if (isProfileAvatarUpload) {
      const profileUserId = targetUserId;
      const uploadId = randomBytes(8).toString('hex');
      const baseName = `profile-${uploadId}`;

      const variants = await generateProfileAvatarVariants(fileBuffer, baseName);

      const profileFolder = `users/${profileUserId}/profile`;
      const { data: existingProfileFiles } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .list(profileFolder, { limit: 200 });

      const fromList = (existingProfileFiles || [])
        .filter((f) => f.name && isProfileAvatarStorageObjectName(f.name))
        .map((f) => `${profileFolder}/${f.name}`);

      const toRemove = [...new Set(fromList)];

      if (toRemove.length > 0) {
        const { error: removeProfileErr } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .remove(toRemove);
        if (removeProfileErr) {
          // Часто «not found» на первом аплоаде — не критично, upsert всё равно перезапишет
          console.warn('[upload-file] profile avatar remove:', removeProfileErr.message);
        }
      }

      const uploadedProfileFiles: string[] = [];
      const uploadProfileErrors: string[] = [];

      for (const [variantFileName, buffer] of Object.entries(variants)) {
        const variantPath = getStoragePath(profileUserId, 'profile', variantFileName);
        const variantContentType = variantFileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

        const { error: variantError } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .upload(variantPath, buffer, {
            contentType: variantContentType,
            upsert: true,
            // 0: иначе CDN/превью в панели Supabase долго отдают старое тело при том же имени файла
            cacheControl: '0',
          });

        if (variantError) {
          console.error(
            `Error uploading profile avatar variant ${variantFileName}:`,
            variantError.message
          );
          uploadProfileErrors.push(`${variantFileName}: ${variantError.message}`);
        } else {
          uploadedProfileFiles.push(variantFileName);
        }
      }

      if (uploadProfileErrors.length > 0) {
        console.error('Some profile avatar variants failed to upload:', uploadProfileErrors);
        if (uploadedProfileFiles.length === 0) {
          return createErrorResponse(
            500,
            `Failed to upload any profile avatar variants: ${uploadProfileErrors.join(', ')}`
          );
        }
      }

      const canonicalPath = getStoragePath(profileUserId, 'profile', `${baseName}-128.webp`);

      return createSuccessResponse(
        {
          url: canonicalPath,
          storagePath: canonicalPath,
          baseName,
        },
        200
      );
    }

    // Для остальных категорий загружаем файл как есть
    // Формируем путь в Storage
    // Используем UUID пользователя из токена для всех категорий
    const audioUserId = targetUserId;
    const storagePath = getStoragePath(audioUserId, normalizedCategory, fileName);

    // Для категории profile удаляем старые файлы профиля
    if (normalizedCategory === 'profile') {
      // Проверяем, существует ли файл с таким именем или любое изображение профиля
      // Ищем все файлы в папке profile, чтобы удалить старые версии (например, profile.png, если загружаем profile.jpg)
      const { data: existingFiles } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .list(`users/${targetUserId}/${normalizedCategory}`, {
          limit: 100, // Получаем все файлы в папке
        });

      // Находим все файлы профиля (profile.*) для удаления старых версий
      const profileFiles = existingFiles?.filter((f) => f.name.startsWith('profile.')) || [];

      // Удаляем все старые файлы профиля (profile.*), чтобы избежать дублирования
      // ВАЖНО: удаляем ВСЕ файлы profile.*, включая тот, который собираемся загрузить
      if (profileFiles.length > 0) {
        const filesToDelete = profileFiles.map((f) =>
          getStoragePath(targetUserId, normalizedCategory, f.name)
        );

        // Удаляем все старые файлы
        const { error: deleteError } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .remove(filesToDelete);

        if (deleteError) {
          console.warn('Failed to delete old files (will try upsert):', {
            filesToDelete,
            error: deleteError.message,
          });
        }
      }
    }

    // Загружаем новый файл в Supabase Storage
    // Используем upsert для гарантированной замены
    const defaultContentType =
      normalizedCategory === 'audio'
        ? 'audio/wav'
        : normalizedCategory === 'stems'
          ? 'image/jpeg'
          : 'image/jpeg';
    const finalContentType = contentType || defaultContentType;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: finalContentType,
        upsert: true, // Обязательно true для замены существующего файла
        cacheControl: normalizedCategory === 'audio' ? '3600' : 'no-cache', // Для audio кеш на 1 час
      });

    if (error) {
      console.error('Error uploading file to Supabase Storage:', {
        error: error.message,
        status: getStorageErrorStatus(error),
        name: error.name,
        storagePath,
        fileSize: fileBuffer.length,
      });
      return createErrorResponse(500, `Failed to upload file: ${error.message}`);
    }

    if (!data) {
      console.error('Upload succeeded but no data returned:', { storagePath });
      return createErrorResponse(500, 'Upload succeeded but no data returned');
    }

    // Получаем публичный URL файла сразу после загрузки
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(storagePath);

    return createSuccessResponse(
      {
        url: urlData.publicUrl,
        storagePath,
      },
      200
    );
  } catch (error) {
    console.error('❌ Error in upload-file function:', {
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
