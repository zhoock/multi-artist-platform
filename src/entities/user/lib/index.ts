/**
 * Утилиты для работы с профилем пользователя и данными текущего пользователя
 */
import { buildApiUrl } from '@shared/lib/artistQuery';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { normalizeProxyImageUrl } from '@shared/api/storage';
import { parseSocialLinksFromApi, type SocialLinks } from '@shared/constants/socialLinks';

export interface UserProfile {
  theBand: string[];
  headerImages?: string[];
}

export interface UserProfileResponse {
  success: boolean;
  data?: {
    theBand: string[];
    headerImages?: string[];
    socialLinks?: SocialLinks;
  } | null;
  error?: string;
}

interface UserProfileLoadOptions {
  includeArtist?: boolean;
  useAuth?: boolean;
  /** Не подставлять описание другого языка (для редактирования в админке). */
  noBandFallback?: boolean;
  /** Публичный slug; если не задан, берётся из Redux `currentArtist` на клиенте. */
  artistSlugOverride?: string | null;
}

async function resolvePublicArtistSlugForProfile(
  options: UserProfileLoadOptions
): Promise<string | null> {
  const direct = options.artistSlugOverride?.trim();
  if (direct) return direct;
  const includeArtist = options.includeArtist ?? true;
  const useAuth = options.useAuth ?? false;
  if (!includeArtist || useAuth) return null;
  try {
    const { getStore } = await import('@shared/model/appStore');
    const { selectPublicArtistSlug } = await import('@shared/model/currentArtist');
    return selectPublicArtistSlug(getStore().getState());
  } catch {
    return null;
  }
}

/**
 * Загружает описание группы (theBand) из БД для текущего пользователя
 */
export async function loadTheBandFromDatabase(
  lang: string,
  options: UserProfileLoadOptions = {}
): Promise<string[] | null> {
  try {
    const includeArtist = options.includeArtist ?? true;
    const useAuth = options.useAuth ?? false;
    const slug = await resolvePublicArtistSlugForProfile(options);
    if (includeArtist && !useAuth && !slug?.trim()) {
      return null;
    }

    let authHeader = {};
    if (useAuth) {
      const { getAuthHeader } = await import('@shared/lib/auth');
      authHeader = getAuthHeader();
    }

    const response = await fetchWithAuthSession(
      buildApiUrl(
        '/api/user-profile',
        {
          lang,
          noBandFallback: options.noBandFallback ? '1' : undefined,
        },
        { includeArtist, artistSlugOverride: slug }
      ),
      {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          ...authHeader,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    const result: UserProfileResponse = await response.json();

    if (result.success && result.data && Array.isArray(result.data.theBand)) {
      const paragraphs = result.data.theBand.filter(
        (paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0
      );
      return paragraphs.length > 0 ? paragraphs : null;
    }

    return null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Ошибка загрузки theBand из БД:', error);
    }
    return null;
  }
}

/**
 * Загружает описание группы (theBand) из статического JSON файла профиля
 */
export async function loadTheBandFromProfileJson(lang: string): Promise<string[] | null> {
  try {
    const { getJSON } = await import('@shared/api/http');
    const { resolveTheBandForLang, hasFilledBandParagraphs } = await import('@shared/lib/theBand');
    const profile = await getJSON<{ theBand: { [key: string]: string[] } }>('profile.json');

    const validLang = lang === 'en' ? 'en' : 'ru';
    const paragraphs = resolveTheBandForLang(profile?.theBand ?? null, validLang);
    return hasFilledBandParagraphs(paragraphs) ? paragraphs : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Ошибка загрузки theBand из profile.json:', error);
    }
    return null;
  }
}

/**
 * Загружает изображения для шапки (header images) из БД для текущего пользователя
 */
export async function loadHeaderImagesFromDatabase(
  useAuth: boolean = false,
  options: UserProfileLoadOptions = {}
): Promise<string[]> {
  try {
    const includeArtist = options.includeArtist ?? true;
    const slug = await resolvePublicArtistSlugForProfile(options);
    if (includeArtist && !useAuth && !slug?.trim()) {
      return [];
    }

    // Для публичных страниц не передаем Authorization header
    // API вернет данные админа для публичного доступа
    let authHeader = {};
    if (useAuth) {
      const { getAuthHeader } = await import('@shared/lib/auth');
      authHeader = getAuthHeader();
    }

    console.log('📡 [loadHeaderImagesFromDatabase] Отправляем запрос к /api/user-profile', {
      useAuth,
      hasAuth: useAuth && 'Authorization' in authHeader && !!authHeader.Authorization,
    });

    const response = await fetchWithAuthSession(
      buildApiUrl('/api/user-profile', {}, { includeArtist, artistSlugOverride: slug }),
      {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          ...authHeader,
        },
      }
    );

    console.log('📡 [loadHeaderImagesFromDatabase] Ответ получен:', {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      console.warn('⚠️ [loadHeaderImagesFromDatabase] Запрос не успешен:', response.status);
      return [];
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('⚠️ [loadHeaderImagesFromDatabase] Неверный content-type:', contentType);
      return [];
    }

    const result: UserProfileResponse = await response.json();
    console.log('📡 [loadHeaderImagesFromDatabase] Результат:', {
      success: result.success,
      hasData: !!result.data,
      headerImages: result.data?.headerImages,
      headerImagesLength: result.data?.headerImages?.length || 0,
    });

    if (result.success && result.data && result.data.headerImages) {
      const convertedImages = result.data.headerImages.map((url) => normalizeProxyImageUrl(url));

      console.log('✅ [loadHeaderImagesFromDatabase] Header images после преобразования:', {
        originalCount: result.data.headerImages.length,
        convertedCount: convertedImages.length,
        convertedImages,
      });

      return convertedImages;
    }

    console.warn('⚠️ [loadHeaderImagesFromDatabase] Header images не найдены в ответе');
    return [];
  } catch (error) {
    console.error('❌ [loadHeaderImagesFromDatabase] Ошибка загрузки header images из БД:', error);
    return [];
  }
}

/**
 * Загружает ссылки на соцсети артиста из БД.
 */
export async function loadSocialLinksFromDatabase(
  options: UserProfileLoadOptions = {}
): Promise<SocialLinks> {
  try {
    const includeArtist = options.includeArtist ?? true;
    const useAuth = options.useAuth ?? false;
    const slug = await resolvePublicArtistSlugForProfile(options);
    if (includeArtist && !useAuth && !slug?.trim()) {
      return {};
    }

    let authHeader = {};
    if (useAuth) {
      const { getAuthHeader } = await import('@shared/lib/auth');
      authHeader = getAuthHeader();
    }

    const response = await fetchWithAuthSession(
      buildApiUrl('/api/user-profile', {}, { includeArtist, artistSlugOverride: slug }),
      {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          ...authHeader,
        },
      }
    );

    if (!response.ok) {
      return {};
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {};
    }

    const result: UserProfileResponse = await response.json();
    if (result.success && result.data?.socialLinks) {
      return parseSocialLinksFromApi(result.data.socialLinks);
    }

    return {};
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Ошибка загрузки social links из БД:', error);
    }
    return {};
  }
}

/**
 * Сохраняет изображения для шапки (header images) в БД для текущего пользователя
 */
export async function saveHeaderImagesToDatabase(
  headerImages: string[]
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { getAuthHeader } = await import('@shared/lib/auth');
    const authHeader = getAuthHeader();

    // Не загружаем theBand при сохранении headerImages, чтобы не перезаписывать его
    // API обработает это корректно, сохранив только headerImages
    const response = await fetchWithAuthSession('/api/user-profile', {
      method: 'POST',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...authHeader,
      },
      body: JSON.stringify({
        headerImages,
      }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } else {
          const text = await response.text();
          if (text) {
            errorMessage = text.substring(0, 200);
          }
        }
      } catch (parseError) {
        console.warn('⚠️ Не удалось распарсить ответ об ошибке:', parseError);
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid content type: expected JSON');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Загружает описание группы (theBand) для обоих языков из БД
 * Используется в админ-панели для отображения обоих версий
 */
export async function loadTheBandBilingualFromDatabase(): Promise<{
  ru: string[] | null;
  en: string[] | null;
}> {
  try {
    const [ruData, enData] = await Promise.all([
      loadTheBandFromDatabase('ru'),
      loadTheBandFromDatabase('en'),
    ]);

    return {
      ru: ruData,
      en: enData,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Ошибка загрузки bilingual theBand из БД:', error);
    }
    return { ru: null, en: null };
  }
}

/**
 * Сохраняет описание группы (theBand) в БД для текущего пользователя
 * Поддерживает как старый формат (один массив), так и новый (отдельно ru/en)
 */
export async function saveTheBandToDatabase(
  theBand: string[] | { ru: string[]; en: string[] },
  lang?: 'ru' | 'en'
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { getAuthHeader } = await import('@shared/lib/auth');
    const authHeader = getAuthHeader();

    // Определяем формат данных
    let requestBody: { theBand?: string[]; theBandRu?: string[]; theBandEn?: string[] };

    if (Array.isArray(theBand)) {
      // Старый формат или сохранение одного языка
      if (lang) {
        // Сохраняем только указанный язык
        requestBody = lang === 'ru' ? { theBandRu: theBand } : { theBandEn: theBand };
      } else {
        // Для обратной совместимости: сохраняем оба языка одинаково
        requestBody = { theBand };
      }
    } else {
      // Новый формат: объект с ru и en
      requestBody = {
        theBandRu: theBand.ru,
        theBandEn: theBand.en,
      };
    }

    const response = await fetchWithAuthSession('/api/user-profile', {
      method: 'POST',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...authHeader,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } else {
          const text = await response.text();
          if (text) {
            errorMessage = text.substring(0, 200);
          }
        }
      } catch (parseError) {
        console.warn('⚠️ Не удалось распарсить ответ об ошибке:', parseError);
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid content type: expected JSON');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
