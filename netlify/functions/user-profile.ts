/**
 * Netlify Function для работы с профилем пользователя
 *
 * GET /api/user-profile?lang=ru - получить описание группы (theBand) для текущего пользователя
 * POST /api/user-profile - сохранить описание группы
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { isCanonicalGenreCode } from '../../src/shared/constants/canonicalGenres';
import { query } from './lib/db';
import {
  getUserIdFromEvent,
  requireAuth,
  unauthorizedFromAuthHeader,
  getAuthorizationHeaderFromEvent,
} from './lib/api-helpers';
import { classifyAuthorizationHeader } from './lib/jwt';
import { assertArtistVisibleToViewer } from './lib/artist-publication';
import { PublicArtistResolverError, resolvePublicArtistUserId } from './lib/public-artist-resolver';
import {
  normalizeBandParagraphs,
  resolveTheBandForLang,
  syncTheBandOnSave,
} from '../../src/shared/lib/theBand';

type SocialPlatform = 'instagram' | 'facebook' | 'youtube' | 'vk';

const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'youtube', 'vk'];

type SocialLinks = Partial<Record<SocialPlatform, string>>;

function parseSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parsed: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = (value as Record<string, unknown>)[platform];
    if (typeof url === 'string' && url.trim()) {
      parsed[platform] = url.trim();
    }
  }
  return parsed;
}

function normalizeSocialLinksForSave(value: unknown): SocialLinks | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = (value as Record<string, unknown>)[platform];
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (trimmed) {
      normalized[platform] = trimmed;
    }
  }
  return normalized;
}

interface UserProfileRow {
  id: string;
  name?: string | null;
  public_slug?: string | null;
  the_band: any; // JSONB
  header_images?: any; // JSONB
  social_links?: any; // JSONB
  site_name?: string | null;
  genre_code?: string | null;
}

interface GetUserProfileResponse {
  success: boolean;
  data?: {
    name?: string | null;
    publicSlug?: string | null;
    theBand: string[];
    headerImages?: string[];
    siteName?: string | null;
    /** Canonical genre for catalog / clustering (`users.genre_code`). */
    genreCode?: string;
    socialLinks?: SocialLinks;
  };
  error?: string;
}

interface SaveUserProfileRequest {
  theBandRu?: string[];
  theBandEn?: string[];
  headerImages?: string[];
  siteName?: string;
  publicSlug?: string;
  genreCode?: string;
  socialLinks?: SocialLinks;
}

interface SaveUserProfileResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Для GET запросов используется getUserIdFromEvent (для админки)
    // Для POST требуется авторизация (пользователь может обновлять свой профиль)
    const userId = event.httpMethod === 'GET' ? getUserIdFromEvent(event) : requireAuth(event);

    if (event.httpMethod === 'GET') {
      let targetUserId = userId;
      const artistSlug = event.queryStringParameters?.artist?.trim();

      // Публичный режим: нужен artist. Если artist нет, но есть JWT — профиль текущего пользователя (админка).
      if (artistSlug) {
        try {
          targetUserId = await resolvePublicArtistUserId(artistSlug);
        } catch (error) {
          if (error instanceof PublicArtistResolverError) {
            return {
              statusCode: error.statusCode,
              headers,
              body: JSON.stringify({
                success: false,
                error: error.message,
                ...(error.code ? { code: error.code } : {}),
              } as GetUserProfileResponse),
            };
          }
          throw error;
        }

        const viewerUserId = getUserIdFromEvent(event);
        try {
          await assertArtistVisibleToViewer(targetUserId, viewerUserId);
        } catch (error) {
          if (error instanceof PublicArtistResolverError) {
            return {
              statusCode: error.statusCode,
              headers,
              body: JSON.stringify({
                success: false,
                error: error.message,
                ...(error.code ? { code: error.code } : {}),
              } as GetUserProfileResponse),
            };
          }
          throw error;
        }
      } else if (!targetUserId) {
        const verdict = classifyAuthorizationHeader(getAuthorizationHeaderFromEvent(event));
        if (verdict.kind === 'expired' || verdict.kind === 'invalid') {
          return unauthorizedFromAuthHeader(event);
        }
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Missing required query parameter: artist',
          } as GetUserProfileResponse),
        };
      }

      const result = await query<UserProfileRow>(
        `SELECT name, public_slug, the_band, header_images, social_links, site_name, genre_code
         FROM users WHERE id = $1 AND is_active = true`,
        [targetUserId],
        0
      );

      if (!result || result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'User not found',
          } as GetUserProfileResponse),
        };
      }

      const user = result.rows[0];

      // Получаем язык из query параметров (по умолчанию 'ru')
      const lang = (event.queryStringParameters?.lang || 'ru').toLowerCase();
      const validLang = lang === 'en' ? 'en' : 'ru';
      const noBandFallback = event.queryStringParameters?.noBandFallback === '1';

      // Текущий язык; если пуст — fallback на другой (единое описание до явного перевода).
      const theBand = resolveTheBandForLang(user.the_band, validLang, {
        fallbackToOtherLang: !noBandFallback,
      });

      const headerImages = user.header_images
        ? Array.isArray(user.header_images)
          ? user.header_images
          : []
        : [];
      const profileName = (user as any).name || null;
      const siteName = (user as any).site_name || profileName || null;
      const publicSlug = (user as any).public_slug || null;
      const rawGenre = (user as UserProfileRow).genre_code;
      const genreCode =
        typeof rawGenre === 'string' && rawGenre.trim() ? rawGenre.trim().toLowerCase() : 'other';
      const socialLinks = parseSocialLinks(user.social_links);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            name: profileName,
            publicSlug,
            theBand,
            headerImages,
            siteName,
            genreCode,
            socialLinks,
          },
        } as GetUserProfileResponse),
      };
    }

    if (event.httpMethod === 'POST') {
      if (!userId) {
        return unauthorizedFromAuthHeader(event);
      }

      const data: SaveUserProfileRequest = JSON.parse(event.body || '{}');

      // Формируем список полей для обновления
      const updateFields: string[] = [];
      const updateValues: unknown[] = [];
      let paramIndex = 1;

      if (data.siteName !== undefined) {
        const normalizedName = (data.siteName ?? '').trim();
        if (!normalizedName) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Artist name is required',
            } as SaveUserProfileResponse),
          };
        }
        // name is source of truth; keep site_name in sync for backward compatibility
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(normalizedName);
        updateFields.push(`site_name = $${paramIndex++}`);
        updateValues.push(normalizedName);
      }

      if (data.publicSlug !== undefined) {
        const normalizedSlug = data.publicSlug.trim().toLowerCase();
        const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

        if (!normalizedSlug) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'publicSlug cannot be empty',
            } as SaveUserProfileResponse),
          };
        }

        if (!slugPattern.test(normalizedSlug)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error:
                'Invalid publicSlug format. Use lowercase latin letters, numbers and hyphens only.',
            } as SaveUserProfileResponse),
          };
        }

        const slugExistsResult = await query<{ id: string }>(
          `SELECT id FROM users WHERE public_slug = $1 AND id <> $2 AND is_active = true LIMIT 1`,
          [normalizedSlug, userId],
          0
        );

        if (slugExistsResult.rows.length > 0) {
          return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'publicSlug is already in use',
            } as SaveUserProfileResponse),
          };
        }

        updateFields.push(`public_slug = $${paramIndex++}`);
        updateValues.push(normalizedSlug);
      }

      if (data.genreCode !== undefined) {
        const normalizedGenreCode = data.genreCode.trim().toLowerCase() || 'other';

        // Тот же набор, что GENRE_OPTIONS / таблица genres (см. canonicalGenres.ts и миграцию 030).
        if (!isCanonicalGenreCode(normalizedGenreCode)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Invalid genreCode',
            } as SaveUserProfileResponse),
          };
        }

        updateFields.push(`genre_code = $${paramIndex++}`);
        updateValues.push(normalizedGenreCode);
      }

      if (data.theBandRu !== undefined || data.theBandEn !== undefined) {
        let currentBandObj: { ru?: string[]; en?: string[] } = {};

        try {
          const currentResult = await query<{ the_band: unknown }>(
            `SELECT the_band FROM users WHERE id = $1 AND is_active = true`,
            [userId],
            0
          );

          if (currentResult.rows.length > 0 && currentResult.rows[0].the_band) {
            const currentBand = currentResult.rows[0].the_band;
            if (
              typeof currentBand === 'object' &&
              currentBand !== null &&
              !Array.isArray(currentBand)
            ) {
              const bandObj = currentBand as { ru?: string[]; en?: string[] };
              currentBandObj = {
                ru: bandObj.ru || [],
                en: bandObj.en || [],
              };
            }
          }
        } catch (error) {
          console.warn('⚠️ Ошибка загрузки текущих данных the_band:', error);
        }

        const ruWasUpdated = data.theBandRu !== undefined;
        const enWasUpdated = data.theBandEn !== undefined;

        if (data.theBandRu !== undefined) {
          if (!Array.isArray(data.theBandRu)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Invalid request data. theBandRu must be an array of strings',
              } as SaveUserProfileResponse),
            };
          }
          currentBandObj.ru = normalizeBandParagraphs(data.theBandRu);
        }

        if (data.theBandEn !== undefined) {
          if (!Array.isArray(data.theBandEn)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Invalid request data. theBandEn must be an array of strings',
              } as SaveUserProfileResponse),
            };
          }
          currentBandObj.en = normalizeBandParagraphs(data.theBandEn);
        }

        const syncedBandObj = syncTheBandOnSave({
          bandObj: {
            ru: currentBandObj.ru ?? [],
            en: currentBandObj.en ?? [],
          },
          ruWasUpdated,
          enWasUpdated,
        });
        currentBandObj.ru = syncedBandObj.ru;
        currentBandObj.en = syncedBandObj.en;

        updateFields.push(`the_band = $${paramIndex++}::jsonb`);
        updateValues.push(JSON.stringify(currentBandObj));
      }

      if (data.headerImages !== undefined) {
        updateFields.push(`header_images = $${paramIndex++}::jsonb`);
        updateValues.push(JSON.stringify(data.headerImages || []));
      }

      const normalizedSocialLinks = normalizeSocialLinksForSave(data.socialLinks);
      if (normalizedSocialLinks !== null) {
        updateFields.push(`social_links = $${paramIndex++}::jsonb`);
        updateValues.push(JSON.stringify(normalizedSocialLinks));
      }

      if (updateFields.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'No fields to update',
          } as SaveUserProfileResponse),
        };
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      // Обновляем указанные поля
      await query(
        `UPDATE users 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND is_active = true`,
        updateValues,
        0
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'User profile updated successfully',
        } as SaveUserProfileResponse),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('❌ Error in user-profile function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
