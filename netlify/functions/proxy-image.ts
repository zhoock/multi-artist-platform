/**
 * Netlify Function для проксирования изображений из Supabase Storage
 * с добавлением CORS заголовков для работы ColorThief
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { assertPublicProxyImagePath, ProxyImagePathError } from './lib/proxy-image-path';

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}> => {
  // CORS headers для работы с фронтенда
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': '*',
  };

  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Проверяем метод запроса
  if (event.httpMethod !== 'GET') {
    console.error('[proxy-image] Invalid method:', event.httpMethod);
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  try {
    // Получаем путь к изображению из query параметра
    const imagePath = event.queryStringParameters?.path;
    if (!imagePath) {
      console.error('[proxy-image] Missing path parameter');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing "path" query parameter' }),
      };
    }

    // Получаем URL Supabase Storage из переменных окружения
    // В Netlify Functions переменные окружения доступны без VITE_ префикса
    // Сначала проверяем переменные без префикса (для продакшена), затем с префиксом (для локальной разработки)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const bucketName = 'user-media';

    if (!supabaseUrl) {
      console.error('[proxy-image] Supabase URL not configured');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Supabase URL not configured' }),
      };
    }

    let decodedPath: string;
    try {
      decodedPath = assertPublicProxyImagePath(imagePath);
    } catch (error) {
      if (error instanceof ProxyImagePathError) {
        console.warn('[proxy-image] Path rejected:', {
          statusCode: error.statusCode,
          message: error.message,
        });
        return {
          statusCode: error.statusCode,
          headers: corsHeaders,
          body: JSON.stringify({ error: error.message }),
        };
      }
      throw error;
    }

    // Формируем полный URL к изображению в Supabase Storage
    // Supabase Storage API требует кодирование пути через encodeURIComponent для каждого сегмента
    // Но слеши должны оставаться незакодированными
    const pathSegments = decodedPath.split('/');
    const encodedSegments = pathSegments.map((segment) => encodeURIComponent(segment));
    const encodedPath = encodedSegments.join('/');
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodedPath}`;

    // Загружаем изображение из Supabase
    let response = await fetch(imageUrl);

    // Если файл не найден (404 или 400), пытаемся найти альтернативные варианты
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      // Извлекаем базовое имя и расширение
      const pathMatch = decodedPath.match(
        /^(.+?\/)(.+?)(?:-64|-128|-448|-896|-1344)(\.(jpg|webp))$/
      );

      if (pathMatch) {
        const [, folder, baseName, , ext] = pathMatch;
        const extension = ext || 'webp';

        // Список вариантов для fallback (от меньшего к большему)
        // Новый формат: без @2x и @3x, просто размеры
        const fallbackVariants = [
          '-64.webp',
          '-64.jpg',
          '-128.webp',
          '-128.jpg',
          '-448.webp',
          '-448.jpg',
          '-896.webp',
          '-896.jpg',
          '-1344.webp',
          `.${extension}`, // Базовое имя без суффикса
        ];

        // Пробуем каждый вариант
        for (const variant of fallbackVariants) {
          const fallbackPath = `${folder}${baseName}${variant}`;
          const fallbackSegments = fallbackPath.split('/');
          const encodedFallbackSegments = fallbackSegments.map((segment) =>
            encodeURIComponent(segment)
          );
          const encodedFallbackPath = encodedFallbackSegments.join('/');
          const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodedFallbackPath}`;

          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            response = fallbackResponse;
            break;
          }
        }
      } else {
        // Если паттерн не совпал, пробуем добавить суффиксы размера к базовому имени
        // Пример: smolyanoe-chuchelko-Cover.jpg -> smolyanoe-chuchelko-Cover-448.webp
        const baseNameMatch = decodedPath.match(/^(.+?\/)(.+?)(\.(jpg|jpeg|png|webp))$/i);
        if (baseNameMatch) {
          const [, folder, baseName, , ext] = baseNameMatch;
          const extension = ext?.toLowerCase() || 'jpg';

          // Список вариантов для fallback (от меньшего к большему - для миниатюр начинаем с 64)
          const fallbackVariants = [
            '-64.webp',
            '-64.jpg',
            '-128.webp',
            '-128.jpg',
            '-448.webp',
            '-448.jpg',
            `.${extension}`, // Базовое имя без суффикса (уже пробовали)
          ];

          // Пробуем каждый вариант
          for (const variant of fallbackVariants) {
            const fallbackPath = `${folder}${baseName}${variant}`;
            const fallbackSegments = fallbackPath.split('/');
            const encodedFallbackSegments = fallbackSegments.map((segment) =>
              encodeURIComponent(segment)
            );
            const encodedFallbackPath = encodedFallbackSegments.join('/');
            const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodedFallbackPath}`;

            const fallbackResponse = await fetch(fallbackUrl);
            if (fallbackResponse.ok) {
              response = fallbackResponse;
              break;
            }
          }
        }
      }
    }

    if (!response.ok) {
      // Получаем текст ошибки от Supabase для диагностики
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        // Игнорируем ошибку чтения текста
      }

      console.error('[proxy-image] Failed to fetch image:', {
        status: response.status,
        statusText: response.statusText,
        originalPath: decodedPath,
        encodedPath,
        url: imageUrl,
        errorText: errorText.substring(0, 200), // Первые 200 символов ошибки
      });
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Failed to fetch image from Supabase',
          status: response.status,
          statusText: response.statusText,
          url: imageUrl,
          path: decodedPath,
          errorText: errorText.substring(0, 200),
        }),
      };
    }

    // Получаем изображение как blob
    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Определяем Content-Type из ответа Supabase или по расширению файла
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Возвращаем изображение с CORS заголовками
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(imageBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error proxying image:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
