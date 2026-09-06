/**
 * Утилиты для обработки изображений с помощью sharp
 */

import sharp from 'sharp';

export interface ImageVariant {
  suffix: string; // например, "-448.jpg", "-896.webp" (новый формат без @2x и @3x)
  width: number;
  height?: number; // если не указано, будет пропорционально
  format: 'jpg' | 'webp' | 'avif';
  quality?: number; // для jpg/webp/avif
}

/**
 * Генерирует все варианты изображения согласно спецификации
 * @param imageBuffer - исходное изображение
 * @param baseName - базовое имя файла (без расширения и суффиксов)
 * @returns объект с буферами всех вариантов
 */
export async function generateImageVariants(
  imageBuffer: Buffer,
  baseName: string
): Promise<Record<string, Buffer>> {
  // Определяем варианты согласно спецификации
  // Новый формат: без @2x и @3x, просто размеры: -64, -128, -448, -896, -1344
  const variants: ImageVariant[] = [
    { suffix: '-64.jpg', width: 64, format: 'jpg', quality: 85 },
    { suffix: '-64.webp', width: 64, format: 'webp', quality: 85 },
    { suffix: '-128.jpg', width: 128, format: 'jpg', quality: 85 },
    { suffix: '-128.webp', width: 128, format: 'webp', quality: 85 },
    { suffix: '-448.jpg', width: 448, format: 'jpg', quality: 85 },
    { suffix: '-448.webp', width: 448, format: 'webp', quality: 85 },
    { suffix: '-896.jpg', width: 896, format: 'jpg', quality: 85 },
    { suffix: '-896.webp', width: 896, format: 'webp', quality: 85 },
    { suffix: '-1344.webp', width: 1344, format: 'webp', quality: 85 },
  ];

  const results: Record<string, Buffer> = {};

  // Получаем метаданные исходного изображения для сохранения пропорций
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;
  const aspectRatio = originalWidth / originalHeight;

  // Генерируем каждый вариант
  for (const variant of variants) {
    const height = variant.height || Math.round(variant.width / aspectRatio);

    let sharpInstance = sharp(imageBuffer).resize(variant.width, height, {
      fit: 'cover', // обрезаем, чтобы заполнить размер
      position: 'center',
    });

    // Применяем формат и качество
    if (variant.format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: variant.quality || 85 });
    } else if (variant.format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality: variant.quality || 85, mozjpeg: true });
    }

    const buffer = await sharpInstance.toBuffer();
    const fileName = `${baseName}${variant.suffix}`;
    results[fileName] = buffer;
  }

  return results;
}

/**
 * Генерирует варианты изображений для hero секции (большие размеры для фона)
 * @param imageBuffer - исходное изображение
 * @param baseName - базовое имя файла (без расширения и суффиксов)
 * @returns объект с буферами всех вариантов
 */
export async function generateHeroImageVariants(
  imageBuffer: Buffer,
  baseName: string
): Promise<Record<string, Buffer>> {
  // Hero: responsive widths for LCP (browser picks via srcset + sizes on the client).
  const variants: ImageVariant[] = [
    { suffix: '-896.avif', width: 896, format: 'avif', quality: 80 },
    { suffix: '-896.webp', width: 896, format: 'webp', quality: 85 },
    { suffix: '-896.jpg', width: 896, format: 'jpg', quality: 85 },
    { suffix: '-1280.avif', width: 1280, format: 'avif', quality: 80 },
    { suffix: '-1280.webp', width: 1280, format: 'webp', quality: 85 },
    { suffix: '-1280.jpg', width: 1280, format: 'jpg', quality: 85 },
    { suffix: '-1920.avif', width: 1920, format: 'avif', quality: 80 },
    { suffix: '-1920.webp', width: 1920, format: 'webp', quality: 85 },
    { suffix: '-1920.jpg', width: 1920, format: 'jpg', quality: 85 },
  ];

  const results: Record<string, Buffer> = {};

  // Получаем метаданные исходного изображения для сохранения пропорций
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;
  const aspectRatio = originalWidth / originalHeight;

  // Генерируем каждый вариант
  for (const variant of variants) {
    const height = variant.height || Math.round(variant.width / aspectRatio);

    let sharpInstance = sharp(imageBuffer).resize(variant.width, height, {
      fit: 'cover', // обрезаем, чтобы заполнить размер
      position: 'center',
    });

    // Применяем формат и качество
    if (variant.format === 'avif') {
      sharpInstance = sharpInstance.avif({ quality: variant.quality || 80 });
    } else if (variant.format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: variant.quality || 85 });
    } else if (variant.format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality: variant.quality || 85, mozjpeg: true });
    }

    const buffer = await sharpInstance.toBuffer();
    const fileName = `${baseName}${variant.suffix}`;
    results[fileName] = buffer;
  }

  return results;
}

/** Canonical 3:2 article cover height for a given variant width. */
export function articleCoverHeightForWidth(width: number): number {
  return Math.round((width * 2) / 3);
}

/** Article cover variant widths (canonical 3:2 crop at generation time). */
export const ARTICLE_COVER_VARIANT_WIDTHS = [128, 448, 896, 1344] as const;

export const ARTICLE_COVER_CACHE_CONTROL = 'max-age=31536000, immutable';

/**
 * Обложки статей (article_cover_*): canonical 3:2 crop, variants -128 / -448 / -896 / -1344.
 * WebP + JPEG для совместимости.
 */
export async function generateArticleCoverVariants(
  imageBuffer: Buffer,
  baseName: string
): Promise<Record<string, Buffer>> {
  const widths = ARTICLE_COVER_VARIANT_WIDTHS;
  const formats: Array<{ format: 'webp' | 'jpg'; quality: number }> = [
    { format: 'webp', quality: 85 },
    { format: 'jpg', quality: 85 },
  ];

  const results: Record<string, Buffer> = {};

  for (const width of widths) {
    const height = articleCoverHeightForWidth(width);

    for (const { format, quality } of formats) {
      const suffix = `-${width}.${format === 'jpg' ? 'jpg' : 'webp'}`;

      let sharpInstance = sharp(imageBuffer).resize(width, height, {
        fit: 'cover',
        position: 'center',
      });

      if (format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality });
      } else {
        sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
      }

      const buffer = await sharpInstance.toBuffer();
      results[`${baseName}${suffix}`] = buffer;
    }
  }

  return results;
}

const PROFILE_AVATAR_SIZE = [128, 256] as const;

/**
 * Аватар профиля: квадрат (cover + center), 128px и 256px, WebP + JPEG. Оригинал не сохраняем.
 */
export async function generateProfileAvatarVariants(
  imageBuffer: Buffer,
  baseName: string
): Promise<Record<string, Buffer>> {
  const results: Record<string, Buffer> = {};

  for (const size of PROFILE_AVATAR_SIZE) {
    for (const format of ['webp', 'jpg'] as const) {
      const suffix = format === 'jpg' ? `-${size}.jpg` : `-${size}.webp`;
      let sharpInstance = sharp(imageBuffer).resize(size, size, {
        fit: 'cover',
        position: 'center',
      });
      if (format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: 85 });
      } else {
        sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
      }
      const buffer = await sharpInstance.toBuffer();
      results[`${baseName}${suffix}`] = buffer;
    }
  }

  return results;
}

/**
 * Получает базовое имя файла из полного пути или простого имени файла
 * @param pathOrFileName - полный путь в Storage (например "users/{userId}/albums/23-cover.webp") или простое имя файла (например "hero-123.jpg")
 * @returns базовое имя без расширения и суффиксов размеров, например "hero-123" или "23-cover"
 */
export function extractBaseName(pathOrFileName: string): string {
  // Извлекаем имя файла из пути (если это путь) или используем как есть (если это просто имя файла)
  const fileName = pathOrFileName.includes('/')
    ? pathOrFileName.split('/').pop() || ''
    : pathOrFileName;
  // Убираем расширение и суффиксы размеров
  // Паттерн: -640.jpg, -1920.avif, -2560.webp и т.д.
  return fileName
    .replace(/[-.](640|1280|1920|2560|64|128|256|320|448|896|1344)\.(jpg|jpeg|png|webp|avif)$/i, '')
    .replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');
}
