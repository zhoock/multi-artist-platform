import { buildStoragePublicObjectUrl } from '@config/supabaseStorageUrl';
import { getUserUserId, type ImageCategory } from '@config/user';
import { getPublicStorageFileUrl } from '@shared/lib/storagePublicFileUrl';

export interface ImageUrlOptions {
  userId?: string;
  category?: ImageCategory;
  useCDN?: boolean;
  useSupabaseStorage?: boolean; // Использовать Supabase Storage вместо локальных файлов
}

type SafeEnv = Record<string, string | undefined>;

function getSafeEnv(): SafeEnv {
  const g = globalThis as unknown as { process?: { env?: SafeEnv } };
  return g.process?.env ?? {};
}

/**
 * Проверяет, включено ли использование Supabase Storage
 */
// Всегда используем Supabase Storage для медиа (обложки/аудио)
function shouldUseSupabaseStorage(_options?: ImageUrlOptions): boolean {
  return true;
}

/**
 * Получить URL изображения
 * @param img - имя файла изображения (без расширения)
 * @param format - расширение файла (по умолчанию '.jpg')
 * @param options - опции для пользовательских изображений
 * @returns URL изображения
 *
 * @example
 * // Старый способ (обратная совместимость)
 * getImageUrl('album_cover') // '/images/album_cover.jpg'
 *
 * // Новый способ с категорией (локальные файлы)
 * getImageUrl('album_cover', '.jpg', { userId: '<uuid>', category: 'albums' })
 * // '/images/users/<uuid>/albums/album_cover.jpg'
 *
 * // Новый способ с Supabase Storage
 * getImageUrl('album_cover', '.jpg', { userId: '<uuid>', category: 'albums', useSupabaseStorage: true })
 * // 'https://[project].supabase.co/storage/v1/object/public/user-media/users/<uuid>/albums/album_cover.jpg'
 */
export function getImageUrl(
  img: string,
  format: string = '.jpg',
  options?: ImageUrlOptions
): string | null {
  // Если это уже готовый URL, возвращаем как есть
  // (важно для multi-artist: backend может присылать proxy/cdn ссылки напрямую).
  if (
    img.startsWith('http://') ||
    img.startsWith('https://') ||
    img.startsWith('data:') ||
    img.startsWith('blob:') ||
    img.startsWith('/api/proxy-image') ||
    img.startsWith('/.netlify/functions/proxy-image')
  ) {
    return img;
  }

  const { userId, category } = options || {};

  // Проверяем, есть ли уже расширение в имени файла
  const hasExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(img);

  // Если указан userId и category
  if (userId && category) {
    const fileName = hasExt ? img : `${img}${format}`;

    // Используем Supabase Storage, если включено
    if (shouldUseSupabaseStorage(options)) {
      const url = getPublicStorageFileUrl({ userId, category, fileName });
      if (url == null) {
        console.error('[BUG] getImageUrl: getPublicStorageFileUrl returned null', {
          userId,
          category,
          fileName,
        });
      }
      return url;
    }

    // Локальные файлы
    return `/images/users/${userId}/${category}/${fileName}`;
  }

  // Старый формат для обратной совместимости
  return `/images/${hasExt ? img : `${img}${format}`}`;
}

/**
 * Получить URL изображения для текущего пользователя
 * @param img - имя файла изображения (без расширения)
 * @param category - категория изображения
 * @param format - расширение файла (по умолчанию '.jpg')
 * @param useSupabaseStorage - использовать Supabase Storage (опционально)
 * @returns URL изображения или `null`, если нет userId / Storage вернул ошибку — причина уже в `[BUG]` в консоли.
 * Для пропов React не «тихо» приводите к `undefined`: `optionalMediaSrc()` в `@shared/lib/media/optionalMediaUrl` добавит контекст компонента.
 *
 * @example
 * getUserImageUrl('album_cover', 'albums') // '/images/users/<uuid>/albums/album_cover.jpg'
 * getUserImageUrl('album_cover', 'albums', '.jpg', true) // Supabase Storage URL
 */
export function getUserImageUrl(
  img: string,
  category: ImageCategory,
  format: string = '.jpg',
  useSupabaseStorage?: boolean,
  /** Явный владелец медиа (альбом/статья); иначе берётся из сессии */
  explicitUserId?: string | null
): string | null {
  const userId =
    explicitUserId !== undefined && explicitUserId !== null && String(explicitUserId).trim() !== ''
      ? String(explicitUserId).trim()
      : getUserUserId();
  if (!userId) {
    console.error('[BUG] userId is missing in getUserImageUrl (pass explicitUserId or sign in).');
    return null;
  }
  return getImageUrl(img, format, {
    userId,
    category,
    useSupabaseStorage,
  });
}

/**
 * Получить URL аудио файла
 * @param audioPath - путь к аудио файлу относительно src/audio (например, "23/01-Barnums-Fijian-Mermaid-1644.wav" или "EP_Mixer/01_PPB_drums.mp3")
 *                   или полный путь вида "/audio/23/01-Barnums-Fijian-Mermaid-1644.wav" (будет автоматически обработан)
 * @param useSupabaseStorage - использовать Supabase Storage (опционально, по умолчанию из переменной окружения)
 * @returns URL аудио или `null` при ошибке (см. `[BUG]` в консоли). Для плейлиста со строгим `string`: `emptyStringMediaSrc()` в `@shared/lib/media/optionalMediaUrl`.
 *
 * @example
 * getUserAudioUrl('23/01-Barnums-Fijian-Mermaid-1644.wav') // '/audio/23/01-Barnums-Fijian-Mermaid-1644.wav'
 * getUserAudioUrl('/audio/23/01-Barnums-Fijian-Mermaid-1644.wav') // '/audio/23/01-Barnums-Fijian-Mermaid-1644.wav' или Supabase Storage URL
 * getUserAudioUrl('EP_Mixer/01_PPB_drums.mp3', true) // Supabase Storage URL
 */
export function getUserAudioUrl(
  audioPath: string,
  useSupabaseStorage?: boolean,
  /** Владелец для относительных путей в bucket (users/{id}/audio/...) */
  explicitUserId?: string | null
): string | null {
  if (audioPath == null || String(audioPath).trim() === '') {
    return null;
  }

  const raw = String(audioPath).trim();

  // Если это уже полный URL (http:// или https://), возвращаем как есть
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  // Путь внутри bucket, как в БД после upload-tracks (users/{uuid}/audio/...)
  // Не зависит от VITE_USE_SUPABASE_STORAGE — иначе путь превращался бы в /audio/users/...
  if (raw.startsWith('users/')) {
    const publicUrl = buildStoragePublicObjectUrl(raw);
    if (publicUrl) {
      return publicUrl;
    }
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      const isProduction =
        !window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1');
      const proxyPath = isProduction ? '/api/proxy-image' : '/.netlify/functions/proxy-image';
      return `${origin}${proxyPath}?path=${encodeURIComponent(raw)}`;
    }
    return raw;
  }

  // Убираем префикс /audio/ если он есть
  const normalizedPath = raw.startsWith('/audio/') ? raw.slice(7) : raw;

  // Проверяем, нужно ли использовать Supabase Storage
  const shouldUseStorage =
    useSupabaseStorage !== undefined
      ? useSupabaseStorage
      : getSafeEnv().VITE_USE_SUPABASE_STORAGE === 'true' ||
        getSafeEnv().USE_SUPABASE_STORAGE === 'true';

  if (shouldUseStorage) {
    // Используем Supabase Storage
    // normalizedPath может быть с подпапками, например "23/01-Barnums-Fijian-Mermaid-1644.wav"
    const userId =
      explicitUserId !== undefined &&
      explicitUserId !== null &&
      String(explicitUserId).trim() !== ''
        ? String(explicitUserId).trim()
        : getUserUserId();
    if (!userId) {
      console.error(
        '[BUG] userId is missing in getUserAudioUrl for storage path (pass explicitUserId or sign in).',
        { audioPath: normalizedPath }
      );
      return null;
    }
    return getPublicStorageFileUrl({
      userId,
      category: 'audio',
      fileName: normalizedPath,
    });
  }

  // Локальные файлы
  return `/audio/${normalizedPath}`;
}

/**
 * Форматирует дату для отображения в формате DD/MM/YYYY
 * Поддерживает ISO формат (YYYY-MM-DD) и другие форматы дат
 */
export function formatDate(dateRelease: string): string {
  if (!dateRelease || !dateRelease.trim()) {
    return '';
  }

  let date: Date;

  // Если дата уже в формате YYYY-MM-DD (ISO), парсим явно
  if (/^\d{4}-\d{2}-\d{2}/.test(dateRelease.trim())) {
    const parts = dateRelease.trim().split(/[-T]/);
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // месяцы в JS начинаются с 0
      const day = parseInt(parts[2], 10);
      date = new Date(year, month, day);
    } else {
      date = new Date(dateRelease);
    }
  } else {
    // Пытаемся распарсить через Date
    date = new Date(dateRelease);
  }

  // Проверяем валидность даты
  if (isNaN(date.getTime())) {
    return dateRelease; // Возвращаем как есть, если не удалось распарсить
  }

  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
