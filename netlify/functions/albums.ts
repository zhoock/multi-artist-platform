/**
 * Netlify Serverless Function для работы с альбомами
 *
 * Поддерживает:
 * - GET: загрузка альбомов из БД (публичные + пользовательские)
 * - POST: создание нового альбома (требует авторизации)
 * - PUT: обновление альбома (требует авторизации)
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { query, getClient } from './lib/db';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  CORS_HEADERS,
  validateLang,
  getUserIdFromEvent,
  requireAuth,
  requireArtistAccount,
  forbiddenArtistAccountResponse,
  unauthorizedFromAuthHeader,
  getAuthorizationHeaderFromEvent,
  parseJsonBody,
  handleError,
} from './lib/api-helpers';
import { classifyAuthorizationHeader } from './lib/jwt';
import type { ApiResponse, SupportedLang } from './lib/types';
import { updateAlbumsJson } from './lib/github-api';
import { assertArtistVisibleToViewer } from './lib/artist-publication';
import { isAlbumRowReadyToPublish } from './lib/album-publish';
import { PublicArtistResolverError, resolvePublicArtistUserId } from './lib/public-artist-resolver';
import { resolveTrackSrcToSupabasePublicUrl } from './lib/storage-public-url';
import { resolveAssetForPlayback } from './lib/assetResolver';
import {
  extractStoragePathFromTrackRef,
  removeTrackStoragePaths,
} from './lib/track-storage-cleanup';
import { fetchTrackAssetsByAlbumPks, resolvePipelineAvailable } from './lib/track-assets-loader';
import { tracksTableHasPipelineColumns, trackAssetsTableExists } from './lib/track-pipeline-schema';
import { migrateUserAlbumAudioFolderAfterRename } from './lib/migrate-storage-album-folder';
import { normalizeTrackIdString } from '../../src/shared/lib/tracks/normalizeTrackIdString';
import { rankToOrderIndex } from '../../src/shared/lib/tracks/trackOrderIndex';
import { normalizeStemsVisibility } from '../../src/shared/lib/stems/stemsVisibility';
import { normalizeTrackVisibility } from '../../src/shared/lib/tracks/trackVisibility';
import { hydrateMissingRuTranslationsOnAlbum } from '../../src/entities/album/lib/hydrateMissingRuTranslations';
import type { TrackLyricsBundle } from '../../src/shared/lib/lyrics/types';
import type { AlbumEditable } from '../../src/models';
import { viewerHasPremiumAccessToArtist } from './lib/entitlements';
import { artistHasMonetizationEnabled } from './lib/artist-monetization';
import { resolveEffectiveContentVisibility } from '../../src/shared/lib/payment/artistMonetization';
import { buildLyricsMapForAlbumTracks, mergeTrackLyricsBundles } from './lib/track-lyrics';
import {
  ARTIST_DISPLAY_NAME_SQL,
  ALBUMS_USER_JOIN_SQL,
  fetchArtistDisplayNameForUserId,
  resolveArtistDisplayNameFromParts,
} from './lib/resolve-album-key';

interface AlbumRow {
  id: string;
  user_id: string | null;
  album_id: string;
  /** Legacy column; not written on create/update. Used only as resolver fallback. */
  artist: string;
  /** Populated when album row is loaded with users JOIN. */
  artist_display_name?: string | null;
  album: string;
  full_name: string;
  description: string;
  cover: string; // Changed from Record<string, unknown> to string
  release: Record<string, unknown>;
  buttons: Record<string, unknown>;
  details: unknown[];
  lang: string;
  is_public: boolean;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
  /** Кредиты обложки — на строку локали (миграция 029). */
  photographer?: string | null;
  photographer_url?: string | null;
  designer?: string | null;
  designer_url?: string | null;
}

interface TrackRow {
  id: string;
  track_id: string;
  title: string;
  duration: number | null;
  src: string | null;
  content: string | null;
  authorship: string | null;
  order_index: number;
  visibility?: string | null;
  stems_visibility?: string | null;
  audio_container?: string | null;
  audio_codec?: string | null;
  audio_bitrate?: number | null;
  audio_sample_rate?: number | null;
  audio_bit_depth?: number | null;
  audio_channels?: number | null;
  audio_duration?: number | string | null;
  audio_file_size?: number | string | null;
  processing_status?: string | null;
  processing_error?: string | null;
}

interface AlbumLocalePayload {
  fullName: string;
  description: string;
  details: unknown[];
  photographer?: string;
  photographerURL?: string;
  designer?: string;
  designerURL?: string;
}

interface AlbumData {
  userId?: string;
  /** Первичный ключ строки в БД (`albums.id`), для платёжных API вместе с `albumId`. */
  dbAlbumId?: string;
  albumId: string;
  artistDisplayName: string;
  album: string;
  fullName: string;
  description: string;
  cover: string; // Changed from Record<string, unknown> to string
  release: Record<string, unknown>;
  buttons: Record<string, unknown>;
  details: unknown[];
  /** Снимок кредитов обложки для этой строки (до merge в `translations`). */
  photographer?: string;
  photographerURL?: string;
  designer?: string;
  designerURL?: string;
  isPublic?: boolean;
  isPublished?: boolean;
  /** Внутренняя метка для merge по свежести строки (не язык). */
  updatedAt?: string;
  /** Присутствует у одноязычного ответа (POST и т.д.); у сливного GET отсутствует. */
  lang?: string;
  translations?: Partial<Record<SupportedLang, AlbumLocalePayload>>;
  tracks: TrackData[];
}

/** В merge GET: только переводимые поля; текст и синхронизация — на корне трека (канон). */
interface TrackLocalePayload {
  title: string;
  authorship?: string;
}

interface TrackData {
  id: string;
  title: string;
  order_index: number;
  duration?: number;
  src?: string;
  /** Plain text mirror of lyrics.content for legacy merge paths. */
  content?: string;
  authorship?: string;
  /** Canonical lyrics + sync state (single source of truth). */
  lyrics: TrackLyricsBundle;
  translations?: Partial<Record<SupportedLang, TrackLocalePayload>>;
  /** Доступ на публичной странице (после GET с `?artist=` применяется policy). */
  visibility?: 'public' | 'subscribers_only' | 'hidden';
  /** Доступ к стемам в Mixer (независимо от visibility). */
  stemsVisibility?: 'public' | 'subscribers_only' | 'hidden';
  /** Только в публичном ответе: нельзя воспроизвести без покупки */
  playbackLocked?: boolean;
  audioContainer?: string | null;
  audioCodec?: string | null;
  audioBitrate?: number | null;
  audioSampleRate?: number | null;
  audioBitDepth?: number | null;
  audioChannels?: number | null;
  audioDuration?: number | null;
  audioFileSize?: number | null;
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  processingError?: string | null;
}

interface AlbumOwnerSlugRow {
  public_slug: string;
}

/** Кэш: есть ли колонка tracks.visibility (миграция 032). */
let cachedTracksHasVisibilityColumn: boolean | null = null;

async function tracksTableHasVisibilityColumn(): Promise<boolean> {
  if (cachedTracksHasVisibilityColumn !== null) {
    return cachedTracksHasVisibilityColumn;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'visibility'
      ) AS exists`
    );
    cachedTracksHasVisibilityColumn = Boolean(r.rows[0]?.exists);
    if (!cachedTracksHasVisibilityColumn) {
      console.warn(
        '[albums] Колонка tracks.visibility отсутствует; ответ без неё (всем трекам считается public). Выполните database/migrations/032_add_track_visibility.sql'
      );
    }
  } catch (checkErr) {
    console.warn('[albums] Не удалось проверить наличие tracks.visibility:', checkErr);
    cachedTracksHasVisibilityColumn = false;
  }
  return cachedTracksHasVisibilityColumn;
}

/** Кэш: есть ли колонка tracks.stems_visibility (миграция 058). */
let cachedTracksHasStemsVisibilityColumn: boolean | null = null;

async function tracksTableHasStemsVisibilityColumn(): Promise<boolean> {
  if (cachedTracksHasStemsVisibilityColumn !== null) {
    return cachedTracksHasStemsVisibilityColumn;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'stems_visibility'
      ) AS exists`
    );
    cachedTracksHasStemsVisibilityColumn = Boolean(r.rows[0]?.exists);
    if (!cachedTracksHasStemsVisibilityColumn) {
      console.warn(
        '[albums] Колонка tracks.stems_visibility отсутствует; ответ без неё (всем трекам считается public). Выполните database/migrations/058_add_stems_visibility.sql'
      );
    }
  } catch (checkErr) {
    console.warn('[albums] Не удалось проверить наличие tracks.stems_visibility:', checkErr);
    cachedTracksHasStemsVisibilityColumn = false;
  }
  return cachedTracksHasStemsVisibilityColumn;
}

/** Кэш: есть ли колонки audio_* (миграция 060). */
let cachedTracksHasAudioTechnicalColumns: boolean | null = null;

async function tracksTableHasAudioTechnicalColumns(): Promise<boolean> {
  if (cachedTracksHasAudioTechnicalColumns !== null) {
    return cachedTracksHasAudioTechnicalColumns;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'audio_container'
      ) AS exists`
    );
    cachedTracksHasAudioTechnicalColumns = Boolean(r.rows[0]?.exists);
    if (!cachedTracksHasAudioTechnicalColumns) {
      console.warn(
        '[albums] Колонки tracks.audio_* отсутствуют; ответ без tech-метаданных. Выполните database/migrations/060_add_track_audio_technical_fields.sql'
      );
    }
  } catch (checkErr) {
    console.warn('[albums] Не удалось проверить наличие tracks.audio_container:', checkErr);
    cachedTracksHasAudioTechnicalColumns = false;
  }
  return cachedTracksHasAudioTechnicalColumns;
}

function optionalPositiveIntFromDb(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.round(num);
}

function optionalPositiveDurationFromDb(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

/** Кэш: есть ли audio_duration / audio_file_size (миграция 061). */
let cachedTracksHasAudioFileMetaColumns: boolean | null = null;

async function tracksTableHasAudioFileMetaColumns(): Promise<boolean> {
  if (cachedTracksHasAudioFileMetaColumns !== null) {
    return cachedTracksHasAudioFileMetaColumns;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'audio_file_size'
      ) AS exists`
    );
    cachedTracksHasAudioFileMetaColumns = Boolean(r.rows[0]?.exists);
    if (!cachedTracksHasAudioFileMetaColumns) {
      console.warn(
        '[albums] Колонки tracks.audio_duration / audio_file_size отсутствуют. Выполните database/migrations/061_add_track_audio_duration_and_file_size.sql'
      );
    }
  } catch (checkErr) {
    console.warn('[albums] Не удалось проверить наличие tracks.audio_file_size:', checkErr);
    cachedTracksHasAudioFileMetaColumns = false;
  }
  return cachedTracksHasAudioFileMetaColumns;
}

/** Загрузка строк треков; без миграции 032 столбец visibility не читается. */
async function fetchTracksRowsForAlbumPk(albumPk: string): Promise<TrackRow[]> {
  const hasVis = await tracksTableHasVisibilityColumn();
  const hasStemsVis = await tracksTableHasStemsVisibilityColumn();
  const hasAudioTech = await tracksTableHasAudioTechnicalColumns();
  const hasAudioFileMeta = await tracksTableHasAudioFileMetaColumns();
  const hasPipeline = await tracksTableHasPipelineColumns();
  const visibilityCol = hasVis ? ',\n                t.visibility' : '';
  const stemsVisibilityCol = hasStemsVis ? ',\n                t.stems_visibility' : '';
  const pipelineCols = hasPipeline
    ? `,\n                t.processing_status,\n                t.processing_error`
    : '';
  const audioTechCols = hasAudioTech
    ? `,\n                t.audio_container,
                t.audio_codec,
                t.audio_bitrate,
                t.audio_sample_rate,
                t.audio_bit_depth,
                t.audio_channels`
    : '';
  const audioFileMetaCols = hasAudioFileMeta
    ? `,\n                t.audio_duration,
                t.audio_file_size`
    : '';
  const res = await query<TrackRow>(
    `SELECT 
                t.id,
                t.track_id,
                t.title,
                t.duration,
                t.src,
                t.content,
                t.authorship,
                t.order_index${visibilityCol}${stemsVisibilityCol}${audioTechCols}${audioFileMetaCols}${pipelineCols}
              FROM tracks t
              WHERE t.album_id = $1
              ORDER BY t.order_index ASC`,
    [albumPk]
  );
  return res.rows;
}

/** Переводимые поля альбома — только внутри translations[lang] (не дублировать в корне запроса). */
interface CreateAlbumRequest {
  albumId: string;
  /** Единое название альбома (все языки). Допускается legacy: translations[lang].album. */
  album?: string;
  translations: Partial<Record<SupportedLang, AlbumLocalePayload>>;
  cover?: string;
  release?: Record<string, unknown>;
  buttons?: Record<string, unknown>;
  lang: SupportedLang;
  isPublic?: boolean;
}

interface UpdateAlbumRequest {
  albumId: string;
  /** Единое название альбома (все языки). */
  album?: string;
  /** Частичное или полное обновление переводимых полей для lang. */
  translations?: Partial<Record<SupportedLang, Partial<AlbumLocalePayload>>>;
  cover?: string;
  release?: Record<string, unknown>;
  buttons?: Record<string, unknown>;
  lang: SupportedLang;
  isPublic?: boolean;
  /** Одноразовая публикация черновика: is_published=true, is_public=true. */
  publish?: boolean;
  /** Старый album_id при смене slug (вместе с albumId = новый). */
  previousAlbumId?: string;
}

const LEGACY_ALBUM_TRANSLATABLE_ROOT = ['fullName', 'description', 'details'] as const;

function albumRequestHasForbiddenRootFields(body: Record<string, unknown>): string | null {
  for (const key of LEGACY_ALBUM_TRANSLATABLE_ROOT) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      return `"${key}" must be sent only inside translations[lang], not at request root`;
    }
  }
  return null;
}

type AlbumsResponse = ApiResponse<AlbumData[]>;

const RELEASE_COVER_FIELD_KEYS = [
  'photographer',
  'photographerURL',
  'designer',
  'designerURL',
] as const;

/**
 * Название альбома из fullName вида «Artist — Title» (длинное тире U+2014, как в EditAlbumModal).
 * Если разделителя нет — считаем, что вся строка есть название.
 */
function deriveAlbumTitleFromFullName(fullName: string): string {
  const raw = fullName.trim();
  if (!raw) return '';
  const sep = ' — ';
  const idx = raw.lastIndexOf(sep);
  if (idx >= 0) return raw.slice(idx + sep.length).trim();
  return raw;
}

/** Общий `release` не должен содержать кредиты обложки (они на строке локали / translations). */
function stripReleaseCoverCredits(release: unknown): Record<string, unknown> {
  if (!release || typeof release !== 'object' || Array.isArray(release)) return {};
  const o = { ...(release as Record<string, unknown>) };
  for (const k of RELEASE_COVER_FIELD_KEYS) {
    delete o[k];
  }
  return o;
}

function readCoverCreditsFromRow(
  album: AlbumRow,
  release: Record<string, unknown>
): {
  photographer: string;
  photographerURL: string;
  designer: string;
  designerURL: string;
} {
  const row = album as unknown as Record<string, unknown>;
  /** После миграции 029 колонки есть в SELECT * — всегда читаем их (даже NULL), иначе пустые значения ошибочно брались из очищенного `release`. */
  const hasMigratedColumns =
    'photographer' in row ||
    'photographer_url' in row ||
    'designer' in row ||
    'designer_url' in row;

  if (hasMigratedColumns) {
    return {
      photographer: String(row.photographer ?? '').trim(),
      photographerURL: String(row.photographer_url ?? '').trim(),
      designer: String(row.designer ?? '').trim(),
      designerURL: String(row.designer_url ?? '').trim(),
    };
  }

  return {
    photographer: typeof release.photographer === 'string' ? release.photographer : '',
    photographerURL: typeof release.photographerURL === 'string' ? release.photographerURL : '',
    designer: typeof release.designer === 'string' ? release.designer : '',
    designerURL: typeof release.designerURL === 'string' ? release.designerURL : '',
  };
}

/**
 * Преобразует данные альбома из БД в формат API
 */
function readArtistDisplayNameFromAlbumRow(album: AlbumRow): string {
  if (album.artist_display_name?.trim()) {
    return album.artist_display_name.trim();
  }
  return resolveArtistDisplayNameFromParts({ legacyAlbumArtist: album.artist });
}

async function queryAlbumRowByPk(albumPk: string): Promise<AlbumRow | null> {
  const result = await query<AlbumRow>(
    `SELECT a.*,
            ${ARTIST_DISPLAY_NAME_SQL} AS artist_display_name
     FROM albums a
     ${ALBUMS_USER_JOIN_SQL}
     WHERE a.id = $1::uuid
     LIMIT 1`,
    [albumPk]
  );
  return result.rows[0] ?? null;
}

function mapAlbumToApiFormat(
  album: AlbumRow,
  tracks: TrackRow[],
  lyricsByTrackId: Map<string, TrackLyricsBundle>,
  options?: {
    assetsByTrackId?: Map<string, import('./lib/assetResolver').TrackAssetRecord[]>;
    pipelineAvailable?: boolean;
  }
): AlbumData {
  // Парсим details, если это строка (PostgreSQL может вернуть JSONB как строку)
  let details: unknown[] = [];
  if (album.details) {
    if (typeof album.details === 'string') {
      try {
        details = JSON.parse(album.details);
      } catch (error) {
        console.error('❌ Error parsing album.details as string:', error);
        details = [];
      }
    } else if (Array.isArray(album.details)) {
      details = album.details;
    } else if (typeof album.details === 'object') {
      // Если это объект, пытаемся преобразовать в массив
      details = [album.details];
    }
  }

  // Парсим release, если это строка
  let release: Record<string, unknown> = {};
  if (album.release) {
    if (typeof album.release === 'string') {
      try {
        release = JSON.parse(album.release);
      } catch (error) {
        console.error('❌ Error parsing album.release as string:', error);
        release = {};
      }
    } else if (typeof album.release === 'object') {
      release = album.release as Record<string, unknown>;
    }
  }

  const coverCredits = readCoverCreditsFromRow(album, release);
  const releaseStripped = stripReleaseCoverCredits(release);

  // Парсим buttons, если это строка
  let buttons: Record<string, unknown> = {};
  if (album.buttons) {
    if (typeof album.buttons === 'string') {
      try {
        buttons = JSON.parse(album.buttons);
      } catch (error) {
        console.error('❌ Error parsing album.buttons as string:', error);
        buttons = {};
      }
    } else if (typeof album.buttons === 'object') {
      buttons = album.buttons as Record<string, unknown>;
    }
  }

  return {
    userId: album.user_id || undefined,
    dbAlbumId: album.id,
    albumId: album.album_id,
    artistDisplayName: readArtistDisplayNameFromAlbumRow(album),
    album: album.album,
    fullName: album.full_name,
    description: album.description,
    cover: album.cover, // Changed: now it's a string, no cast needed
    release: releaseStripped,
    photographer: coverCredits.photographer,
    photographerURL: coverCredits.photographerURL,
    designer: coverCredits.designer,
    designerURL: coverCredits.designerURL,
    buttons,
    details,
    lang: album.lang,
    tracks: tracks.map((track) => {
      // PostgreSQL DECIMAL возвращается как строка, конвертируем в число
      // Обрабатываем случаи: null, пустая строка, невалидное значение
      let duration: number | undefined = undefined;
      if (track.duration != null) {
        const durationNum =
          typeof track.duration === 'string' ? parseFloat(track.duration) : Number(track.duration);
        // Проверяем, что это валидное положительное число
        if (Number.isFinite(durationNum) && durationNum > 0) {
          duration = durationNum;
        }
      }

      // Логируем для отладки, если duration отсутствует
      if (duration == null && track.track_id) {
        console.log(
          `[albums.ts] ⚠️ Track ${track.track_id} (${track.title}) has no duration. Raw value:`,
          track.duration
        );
      }

      const lyrics =
        lyricsByTrackId.get(track.track_id) ??
        ({
          albumId: album.album_id,
          trackId: String(track.track_id),
          lang: album.lang === 'ru' ? 'ru' : 'en',
          content: track.content || '',
          authorship: track.authorship || undefined,
          syncedLines: null,
          state: track.content?.trim() ? 'text-only' : 'empty',
          syncedAt: null,
        } satisfies TrackLyricsBundle);

      const assets = options?.assetsByTrackId?.get(track.track_id) ?? [];
      const pipelineAvailable = options?.pipelineAvailable === true;
      const processingStatus = (track.processing_status ??
        'ready') as TrackData['processingStatus'];

      let resolvedSrc: string | undefined;
      if (pipelineAvailable) {
        const playback = resolveAssetForPlayback(
          assets,
          {
            purpose: 'playback',
            processingStatus: processingStatus ?? 'ready',
            hasPremiumAccess: true,
            legacySrc: track.src,
            pipelineAvailable: true,
          },
          album.user_id
        );
        resolvedSrc = playback.url ?? undefined;
      } else {
        resolvedSrc = resolveTrackSrcToSupabasePublicUrl(track.src, album.user_id);
      }

      return {
        id: normalizeTrackIdString(track.track_id) || String(track.track_id),
        title: track.title,
        order_index:
          typeof track.order_index === 'number' && !Number.isNaN(track.order_index)
            ? track.order_index
            : 0,
        duration: duration ?? 0,
        src: resolvedSrc,
        processingStatus: pipelineAvailable ? processingStatus : undefined,
        processingError:
          pipelineAvailable && track.processing_error?.trim()
            ? track.processing_error.trim()
            : undefined,
        content: lyrics.content || undefined,
        authorship: lyrics.authorship || track.authorship || undefined,
        lyrics,
        visibility: normalizeTrackVisibility(track.visibility),
        stemsVisibility: normalizeStemsVisibility(track.stems_visibility),
        audioContainer: track.audio_container?.trim() || null,
        audioCodec: track.audio_codec?.trim() || null,
        audioBitrate: optionalPositiveIntFromDb(track.audio_bitrate),
        audioSampleRate: optionalPositiveIntFromDb(track.audio_sample_rate),
        audioBitDepth: optionalPositiveIntFromDb(track.audio_bit_depth),
        audioChannels: optionalPositiveIntFromDb(track.audio_channels),
        audioDuration: optionalPositiveDurationFromDb(track.audio_duration),
        audioFileSize: optionalPositiveIntFromDb(track.audio_file_size),
      };
    }),
    isPublic: album.is_public,
    isPublished: album.is_published,
    updatedAt:
      album.updated_at != null ? new Date(album.updated_at as Date).toISOString() : undefined,
  };
}

/** Синхронизация общих полей альбома по всем строкам локалей (один user_id + album_id). */
async function syncSharedAlbumMetadataAcrossLocales(
  userId: string,
  albumId: string,
  patch: {
    album?: string;
    releaseJson?: string;
    isPublic?: boolean;
    isPublished?: boolean;
    cover?: string;
    buttonsJson?: string;
  }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.album !== undefined) {
    sets.push(`album = $${i++}`);
    values.push(patch.album);
  }
  if (patch.releaseJson !== undefined) {
    sets.push(`release = $${i++}::jsonb`);
    try {
      const parsed = JSON.parse(patch.releaseJson) as unknown;
      values.push(JSON.stringify(stripReleaseCoverCredits(parsed)));
    } catch {
      values.push(patch.releaseJson);
    }
  }
  if (patch.isPublic !== undefined) {
    sets.push(`is_public = $${i++}`);
    values.push(patch.isPublic);
  }
  if (patch.isPublished !== undefined) {
    sets.push(`is_published = $${i++}`);
    values.push(patch.isPublished);
  }
  if (patch.cover !== undefined) {
    sets.push(`cover = $${i++}::text`);
    values.push(patch.cover);
  }
  if (patch.buttonsJson !== undefined) {
    sets.push(`buttons = $${i++}::jsonb`);
    values.push(patch.buttonsJson);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId, albumId);
  await query(
    `UPDATE albums SET ${sets.join(', ')} WHERE user_id = $${i++} AND album_id = $${i++}`,
    values
  );
}

const ALBUM_STRING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Переименование строкового album_id у пользователя: albums + synced_lyrics + orders + purchases.
 * Треки (FK на UUID albums.id) не трогаем.
 */
async function renameUserAlbumStringId(
  userId: string,
  oldId: string,
  newId: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (oldId === newId) return { ok: true };
  // album-${Date.now()} и прочие id с цифрами
  if (!ALBUM_STRING_ID_PATTERN.test(newId) || newId.length > 255) {
    return { ok: false, status: 400, message: 'Invalid albumId format' };
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const checkOld = await client.query(
      `SELECT 1 FROM albums WHERE user_id = $1 AND album_id = $2 LIMIT 1`,
      [userId, oldId]
    );
    if (checkOld.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, message: 'Album not found' };
    }
    const checkNew = await client.query(
      `SELECT 1 FROM albums WHERE user_id = $1 AND album_id = $2 LIMIT 1`,
      [userId, newId]
    );
    if (checkNew.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        message: 'An album with this URL id already exists',
      };
    }

    await client.query(
      `UPDATE purchases p SET album_id = $3
       FROM orders o
       WHERE p.order_id = o.id AND o.user_id = $1 AND o.album_id = $2 AND p.album_id = $2`,
      [userId, oldId, newId]
    );
    await client.query(`UPDATE orders SET album_id = $3 WHERE user_id = $1 AND album_id = $2`, [
      userId,
      oldId,
      newId,
    ]);
    await client.query(
      `UPDATE synced_lyrics SET album_id = $3 WHERE user_id = $1 AND album_id = $2`,
      [userId, oldId, newId]
    );
    await client.query(`UPDATE albums SET album_id = $3 WHERE user_id = $1 AND album_id = $2`, [
      userId,
      oldId,
      newId,
    ]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    client.release();
  }
}

function sortAlbumRowsForMerge(rows: AlbumRow[]): AlbumRow[] {
  const rank = (l: string) => (l === 'ru' ? 0 : l === 'en' ? 1 : 2);
  return [...rows].sort(
    (a, b) =>
      rank(a.lang) - rank(b.lang) ||
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

function pickFirstTrackWithId(sorted: AlbumData[], trackId: string): TrackData | undefined {
  const tid = String(trackId);
  for (const p of sorted) {
    const m = p.tracks.find((t) => String(t.id) === tid);
    if (m) return m;
  }
  return undefined;
}

/**
 * Текст и синхронизация — один канон (корень трека, приоритет ru-строки альбома).
 * В translations[lang] только title + authorship.
 *
 * Важно: не брать только `sorted[0].tracks` — если треки загружены только в en-строку альбома,
 * а ru-строка пустая, иначе сливной GET отдаёт 0 треков и кабинет «теряет» их.
 */
function mergeTrackPayloads(payloads: AlbumData[]): TrackData[] {
  const sorted = [...payloads].sort((a, b) => {
    const rank = (l: string | undefined) => (l === 'ru' ? 0 : l === 'en' ? 1 : 2);
    return rank(a.lang) - rank(b.lang);
  });

  const orderById = new Map<string, number>();
  for (const p of sorted) {
    for (const t of p.tracks) {
      const id = String(t.id);
      const ord =
        typeof t.order_index === 'number' && !Number.isNaN(t.order_index) ? t.order_index : 0;
      if (!orderById.has(id)) {
        orderById.set(id, ord);
      } else {
        orderById.set(id, Math.min(orderById.get(id)!, ord));
      }
    }
  }

  const uniqueIds = [...orderById.keys()].sort((a, b) => {
    const oa = orderById.get(a) ?? 0;
    const ob = orderById.get(b) ?? 0;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  return uniqueIds.map((tid) => {
    const ct = pickFirstTrackWithId(sorted, tid);
    if (!ct) {
      throw new Error(`mergeTrackPayloads: missing track ${tid}`);
    }
    const translations: Partial<Record<SupportedLang, TrackLocalePayload>> = {};
    for (const p of sorted) {
      if (!p.lang || !validateLang(p.lang)) continue;
      const match = p.tracks.find((t) => String(t.id) === tid);
      if (match) {
        translations[p.lang] = {
          title: match.title,
          authorship: match.authorship,
        };
      }
    }
    const bundles = sorted
      .map((p) => p.tracks.find((t) => String(t.id) === tid)?.lyrics)
      .filter((b): b is TrackLyricsBundle => Boolean(b));
    const mergedLyrics = mergeTrackLyricsBundles(bundles.length > 0 ? bundles : [ct.lyrics]);

    return {
      ...ct,
      content: mergedLyrics.content,
      authorship: mergedLyrics.authorship ?? ct.authorship,
      lyrics: mergedLyrics,
      translations,
    };
  });
}

function mergeAlbumDataPayloads(payloads: AlbumData[]): AlbumData {
  if (payloads.length === 0) {
    throw new Error('mergeAlbumDataPayloads: empty payloads');
  }
  /** Общие поля (album, release, cover, buttons, is_public) — с самой свежей строки по `updatedAt`, не по языку. */
  const sortedForShared = [...payloads].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
  const shared = sortedForShared[0];
  /** Название альбома общее для локалей; не брать только с «самой свежей» строки — после PUT по details у ru/en может быть более новый updated_at при старом album. */
  const enPayload = payloads.find((p) => p.lang === 'en');
  const ruPayload = payloads.find((p) => p.lang === 'ru');
  const sharedAlbumTitle =
    (enPayload?.album && String(enPayload.album).trim()) ||
    (ruPayload?.album && String(ruPayload.album).trim()) ||
    (shared.album && String(shared.album).trim()) ||
    '';
  const sortedForTracks = [...payloads].sort((a, b) => {
    const rank = (l: string | undefined) => (l === 'ru' ? 0 : l === 'en' ? 1 : 2);
    return rank(a.lang) - rank(b.lang);
  });
  /** Корневые fullName/description/details — дубликат для legacy; истина в `translations`. Берём ru при наличии, иначе первую локаль. */
  const textRoot = sortedForTracks[0] ?? shared;
  const translations: Partial<Record<SupportedLang, AlbumLocalePayload>> = {};
  for (const p of sortedForTracks) {
    if (p.lang && validateLang(p.lang)) {
      translations[p.lang] = {
        fullName: p.fullName,
        description: p.description,
        details: p.details,
        photographer: p.photographer ?? '',
        photographerURL: p.photographerURL ?? '',
        designer: p.designer ?? '',
        designerURL: p.designerURL ?? '',
      };
    }
  }
  const tracks = mergeTrackPayloads(sortedForTracks);
  return {
    userId: shared.userId,
    dbAlbumId: shared.dbAlbumId,
    albumId: shared.albumId,
    artistDisplayName: shared.artistDisplayName,
    album: sharedAlbumTitle,
    fullName: textRoot.fullName,
    description: textRoot.description,
    cover: shared.cover,
    release: shared.release,
    buttons: shared.buttons,
    details: textRoot.details,
    isPublic: shared.isPublic,
    isPublished: shared.isPublished,
    tracks,
    translations,
  };
}

/**
 * Публичный каталог (?artist=…): скрытые треки не отдаём никому;
 * полный список с аудио — только GET /api/albums из кабинета без ?artist=.
 * subscribers_only без активной подписки (или владения) — без src и playbackLocked.
 * Пока у артиста нет монетизации, subscribers_only ведёт себя как public.
 */
function applyPublicTrackAccessPolicy(
  album: AlbumData,
  ctx: { hasPremiumAccess: boolean; monetizationEnabled: boolean }
): AlbumData {
  /**
   * Скрытые треки не показываем на публичной витрине, кроме случая когда стемы
   * доступны в Mixer (stemsVisibility !== hidden) — тогда трек остаётся в API с visibility: hidden.
   */
  const catalogTracks = album.tracks.filter((t) => {
    const trackVis = normalizeTrackVisibility(t.visibility);
    if (trackVis !== 'hidden') return true;
    return normalizeStemsVisibility(t.stemsVisibility) !== 'hidden';
  });

  const nextTracks = catalogTracks.map((t) => {
    const visibility = resolveEffectiveContentVisibility(
      normalizeTrackVisibility(t.visibility),
      ctx.monetizationEnabled
    );
    const stemsVisibility = resolveEffectiveContentVisibility(
      normalizeStemsVisibility(t.stemsVisibility),
      ctx.monetizationEnabled
    );
    const needLock = visibility === 'subscribers_only' && !ctx.hasPremiumAccess;
    if (needLock) {
      return {
        ...t,
        visibility,
        stemsVisibility,
        src: '',
        playbackLocked: true,
      };
    }
    return { ...t, visibility, stemsVisibility, playbackLocked: false };
  });
  return { ...album, tracks: nextTracks };
}

/** Загрузка одной языковой версии альбома (как раньше один ряд albums + треки). */
async function loadAlbumDataFromRow(album: AlbumRow): Promise<AlbumData> {
  const rowLang = album.lang;

  const [tracksRows, assetsByTrackId, pipelineAvailable] = await Promise.all([
    fetchTracksRowsForAlbumPk(album.id),
    fetchTrackAssetsByAlbumPks([album.id]),
    resolvePipelineAvailable(),
  ]);

  if (album.album_id === '23-remastered') {
    console.log(`[albums.ts GET] 🔍 DEBUG tracks query for 23-remastered:`, {
      albumId: album.album_id,
      albumUUID: album.id,
      lang: album.lang,
      tracksCount: tracksRows.length,
      tracks: tracksRows.map((t) => ({
        trackId: t.track_id,
        title: t.title,
        orderIndex: t.order_index,
      })),
    });

    if (tracksRows.length > 3) {
      console.log(`[albums.ts GET] ⚠️ ПРОБЛЕМА: Найдено ${tracksRows.length} треков вместо 3!`);
      const allTracksCheck = await query<{
        track_id: string;
        title: string;
        album_uuid: string;
        album_created_at: Date;
      }>(
        `SELECT t.track_id, t.title, a.id as album_uuid, a.created_at as album_created_at
                   FROM tracks t
                   INNER JOIN albums a ON t.album_id = a.id
                   WHERE a.album_id = $1 AND a.lang = $2
                   ORDER BY a.created_at DESC, t.order_index ASC`,
        [album.album_id, album.lang]
      );

      console.log(`[albums.ts GET] Все треки для album_id='23-remastered' (${album.lang}):`, {
        totalTracksInDB: allTracksCheck.rows.length,
        uniqueAlbumUUIDs: Array.from(new Set(allTracksCheck.rows.map((r) => r.album_uuid))),
        currentAlbumUUID: album.id,
        tracksForCurrentAlbum: tracksRows.length,
      });
    }
  }

  console.log(`[albums.ts GET] Tracks loaded for album ${album.album_id} (${album.lang}):`, {
    tracksCount: tracksRows.length,
    tracksWithDuration: tracksRows.filter((t) => t.duration != null).length,
    tracksWithoutDuration: tracksRows.filter((t) => t.duration == null).length,
    sampleTrack: tracksRows[0]
      ? {
          trackId: tracksRows[0].track_id,
          title: tracksRows[0].title,
          duration: tracksRows[0].duration,
          durationType: typeof tracksRows[0].duration,
        }
      : null,
  });

  const lyricsByTrackId = await buildLyricsMapForAlbumTracks(
    album.album_id,
    album.user_id,
    tracksRows,
    album.lang
  );

  const mapped = mapAlbumToApiFormat(album, tracksRows, lyricsByTrackId, {
    assetsByTrackId,
    pipelineAvailable,
  });
  console.log(`[albums.ts GET] Album ${album.album_id} mapped tracks:`, {
    tracksCount: mapped.tracks.length,
    tracksWithDuration: mapped.tracks.filter((t) => t.duration != null).length,
    tracksWithoutDuration: mapped.tracks.filter((t) => t.duration == null).length,
    sampleTrack: mapped.tracks[0]
      ? {
          id: mapped.tracks[0].id,
          title: mapped.tracks[0].title,
          duration: mapped.tracks[0].duration,
          durationType: typeof mapped.tracks[0].duration,
        }
      : null,
  });

  return mapped;
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  // Игнорируем запросы к /cover/draft и /cover/commit - они должны обрабатываться отдельными функциями
  const path = event.path || '';
  if (path.includes('/cover/draft') || path.includes('/cover/commit')) {
    console.log(
      '[albums.ts] Ignoring cover request, should be handled by dedicated function:',
      path
    );
    return createErrorResponse(
      404,
      'This endpoint should be handled by upload-cover-draft or commit-cover function. Check netlify.toml redirects.'
    );
  }

  try {
    // GET: загрузка альбомов (все языковые версии сливаются в одну сущность с translations)
    if (event.httpMethod === 'GET') {
      const { artist, resolveOwnerByAlbumId, albumId } = event.queryStringParameters || {};

      // Resolve helper: find artist slug by albumId (used for smart redirect from /albums/:id).
      if (resolveOwnerByAlbumId === 'true') {
        if (!albumId) {
          return createErrorResponse(400, 'albumId is required when resolveOwnerByAlbumId=true');
        }

        const ownerResult = await query<AlbumOwnerSlugRow>(
          `SELECT u.public_slug
           FROM albums a
           INNER JOIN users u ON u.id = a.user_id
           WHERE a.album_id = $1
             AND u.is_active = true
             AND u.public_slug IS NOT NULL
           ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
           LIMIT 1`,
          [albumId]
        );

        if (ownerResult.rows.length === 0) {
          return createErrorResponse(404, 'Album owner slug not found');
        }

        return createSuccessResponse({ artistSlug: ownerResult.rows[0].public_slug });
      }

      const authVerdict = classifyAuthorizationHeader(getAuthorizationHeaderFromEvent(event));
      let targetUserId: string;

      if (artist) {
        try {
          targetUserId = await resolvePublicArtistUserId(artist);
        } catch (error) {
          if (error instanceof PublicArtistResolverError) {
            return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
              code: error.code,
            });
          }
          throw error;
        }
      } else if (authVerdict.kind === 'valid') {
        // Приватный режим для админки: JWT без ?artist= — владелец по токену.
        targetUserId = authVerdict.userId;
      } else if (authVerdict.kind === 'none') {
        return createErrorResponse(
          400,
          'Missing required query parameter: artist (public requests must specify an artist)'
        );
      } else if (authVerdict.kind === 'expired') {
        return createErrorResponse(401, 'Session expired. Please sign in again.', CORS_HEADERS, {
          code: 'SESSION_EXPIRED',
        });
      } else {
        return createErrorResponse(401, 'Invalid session. Please sign in again.', CORS_HEADERS, {
          code: 'INVALID_SESSION',
          details: authVerdict.kind === 'invalid' ? authVerdict.reason : undefined,
        });
      }

      const authUserId = authVerdict.kind === 'valid' ? authVerdict.userId : null;

      if (artist) {
        try {
          await assertArtistVisibleToViewer(targetUserId, authUserId);
        } catch (error) {
          if (error instanceof PublicArtistResolverError) {
            return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
              code: error.code,
            });
          }
          throw error;
        }
      }

      // Возвращаем альбомы только выбранного артиста (owner user_id), все lang → merge
      const albumsResult = await query<AlbumRow>(
        `SELECT
             a.id,
             a.user_id,
             a.album_id,
             a.artist,
             ${ARTIST_DISPLAY_NAME_SQL} AS artist_display_name,
             a.album,
             a.full_name,
             a.description,
             a.cover,
             a.release,
             a.buttons,
             a.details,
             a.lang,
             a.is_public,
             a.is_published,
             a.created_at,
             a.updated_at,
             a.photographer,
             a.photographer_url,
             a.designer,
             a.designer_url
         FROM albums a
         ${ALBUMS_USER_JOIN_SQL}
         WHERE a.user_id = $1
         ORDER BY a.album_id,
           CASE a.lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
           a.updated_at DESC NULLS LAST,
           a.created_at DESC`,
        [targetUserId]
      );

      const byAlbumId = new Map<string, AlbumRow[]>();
      const albumIdsOrdered: string[] = [];
      for (const row of albumsResult.rows) {
        if (!byAlbumId.has(row.album_id)) {
          albumIdsOrdered.push(row.album_id);
          byAlbumId.set(row.album_id, []);
        }
        byAlbumId.get(row.album_id)!.push(row);
      }

      const artistParam = artist?.trim();
      const isPublicCatalogRequest = Boolean(artistParam);
      const monetizationEnabled = isPublicCatalogRequest
        ? await artistHasMonetizationEnabled(targetUserId)
        : true;
      const hasPremiumAccess = isPublicCatalogRequest
        ? await viewerHasPremiumAccessToArtist(authUserId, targetUserId)
        : false;

      const albumsWithTracks: AlbumData[] = [];
      for (const albumKey of albumIdsOrdered) {
        const group = byAlbumId.get(albumKey)!;
        const sorted = sortAlbumRowsForMerge(group);
        const payloads = await Promise.all(sorted.map((r) => loadAlbumDataFromRow(r)));
        let merged = mergeAlbumDataPayloads(payloads);

        if (isPublicCatalogRequest) {
          merged = applyPublicTrackAccessPolicy(merged, {
            hasPremiumAccess,
            monetizationEnabled,
          });
          const isOwnerViewer = Boolean(authUserId && authUserId === targetUserId);
          if (
            !isOwnerViewer &&
            (merged.isPublished === false ||
              merged.isPublic === false ||
              !String(merged.album ?? '').trim() ||
              merged.tracks.length === 0)
          ) {
            continue;
          }
        } else {
          merged = {
            ...merged,
            tracks: merged.tracks.map((t) => ({
              ...t,
              visibility: normalizeTrackVisibility(t.visibility),
              stemsVisibility: normalizeStemsVisibility(t.stemsVisibility),
            })),
          };
        }

        albumsWithTracks.push(
          hydrateMissingRuTranslationsOnAlbum(merged as AlbumEditable) as unknown as AlbumData
        );
      }

      return createSuccessResponse(albumsWithTracks);
    }

    // POST: создание альбома (требует авторизации)
    if (event.httpMethod === 'POST') {
      const userId = requireArtistAccount(event);

      if (!userId) {
        return requireAuth(event)
          ? forbiddenArtistAccountResponse(event)
          : unauthorizedFromAuthHeader(event);
      }

      let data: CreateAlbumRequest;
      try {
        data = parseJsonBody<CreateAlbumRequest>(event.body, {} as CreateAlbumRequest);
      } catch (error) {
        return createErrorResponse(
          400,
          error instanceof Error ? error.message : 'Invalid JSON body'
        );
      }

      const forbidden = albumRequestHasForbiddenRootFields(
        data as unknown as Record<string, unknown>
      );
      if (forbidden) {
        return createErrorResponse(400, forbidden);
      }

      const locale = data.translations?.[data.lang];
      const legacyTitle = (locale as { album?: string } | undefined)?.album?.trim?.() ?? '';
      const albumTitle = (typeof data.album === 'string' && data.album.trim()) || legacyTitle || '';

      console.log('📝 POST /api/albums - Request data:', {
        albumId: data.albumId,
        lang: data.lang,
        hasTranslations: !!data.translations,
        bodyKeys: Object.keys(data),
      });

      if (!data.albumId || !data.lang || !validateLang(data.lang)) {
        console.error('❌ POST /api/albums - Validation failed:', {
          missingFields: {
            albumId: !data.albumId,
            lang: !data.lang || !validateLang(data.lang),
          },
          receivedData: data,
        });
        return createErrorResponse(
          400,
          'Missing required fields: albumId, lang (must be "en" or "ru")'
        );
      }

      if (!albumTitle) {
        return createErrorResponse(
          400,
          'Missing album title: set `album` at request root (or legacy translations[lang].album)'
        );
      }

      const albumUserId = userId;

      const releaseForDb = stripReleaseCoverCredits(data.release || {});

      const albumResult = await query<AlbumRow>(
        `INSERT INTO albums (
          user_id, album_id, artist, album, full_name, description,
          cover, release, buttons, details, lang, is_public, is_published,
          photographer, photographer_url, designer, designer_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (user_id, album_id, lang)
        DO UPDATE SET
          album = EXCLUDED.album,
          full_name = EXCLUDED.full_name,
          description = EXCLUDED.description,
          cover = EXCLUDED.cover,
          release = EXCLUDED.release,
          buttons = EXCLUDED.buttons,
          details = EXCLUDED.details,
          is_public = EXCLUDED.is_public,
          is_published = EXCLUDED.is_published,
          photographer = EXCLUDED.photographer,
          photographer_url = EXCLUDED.photographer_url,
          designer = EXCLUDED.designer,
          designer_url = EXCLUDED.designer_url,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          albumUserId,
          data.albumId,
          '',
          albumTitle,
          locale?.fullName ?? null,
          locale?.description ?? null,
          data.cover || null,
          JSON.stringify(releaseForDb),
          JSON.stringify(data.buttons || {}),
          JSON.stringify(locale?.details ?? []),
          data.lang,
          data.isPublic !== undefined ? data.isPublic : false,
          false,
          locale?.photographer ?? null,
          locale?.photographerURL ?? null,
          locale?.designer ?? null,
          locale?.designerURL ?? null,
        ]
      );

      const createdRow = albumResult.rows[0];
      const createdArtistDisplayName = await fetchArtistDisplayNameForUserId(
        albumUserId,
        createdRow.artist
      );
      const createdAlbum = mapAlbumToApiFormat(
        { ...createdRow, artist_display_name: createdArtistDisplayName },
        [],
        new Map()
      );

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          message: 'Album created successfully',
          data: [createdAlbum],
        }),
      };
    }

    // PUT: обновление альбома (требует авторизации)
    if (event.httpMethod === 'PUT') {
      try {
        const userId = requireArtistAccount(event);

        if (!userId) {
          return requireAuth(event)
            ? forbiddenArtistAccountResponse(event)
            : unauthorizedFromAuthHeader(event);
        }

        let data: UpdateAlbumRequest;
        try {
          data = parseJsonBody<UpdateAlbumRequest>(event.body, {} as UpdateAlbumRequest);
        } catch (error) {
          return createErrorResponse(
            400,
            error instanceof Error ? error.message : 'Invalid JSON body'
          );
        }

        const forbiddenPut = albumRequestHasForbiddenRootFields(
          data as unknown as Record<string, unknown>
        );
        if (forbiddenPut) {
          return createErrorResponse(400, forbiddenPut);
        }

        console.log('📝 PUT /api/albums - Request data:', {
          albumId: data.albumId,
          lang: data.lang,
          hasTranslations: data.translations !== undefined,
          hasRelease: data.release !== undefined,
          hasButtons: data.buttons !== undefined,
        });

        if (!data.albumId || !data.lang || !validateLang(data.lang)) {
          return createErrorResponse(
            400,
            'Missing required fields: albumId, lang (must be "en" or "ru")'
          );
        }

        const previousAlbumIdRaw =
          typeof data.previousAlbumId === 'string' ? data.previousAlbumId.trim() : '';
        let albumIdRenameApplied = false;
        if (previousAlbumIdRaw && previousAlbumIdRaw !== data.albumId) {
          const renameResult = await renameUserAlbumStringId(
            userId,
            previousAlbumIdRaw,
            data.albumId
          );
          if (!renameResult.ok) {
            return createErrorResponse(renameResult.status, renameResult.message);
          }
          albumIdRenameApplied = true;
          const storageMigrate = await migrateUserAlbumAudioFolderAfterRename({
            userId,
            oldAlbumId: previousAlbumIdRaw,
            newAlbumId: data.albumId,
          });
          if (!storageMigrate.ok) {
            console.error(
              '[albums.ts PUT] Storage migration after album URL id rename failed:',
              storageMigrate.message
            );
            return createErrorResponse(500, storageMigrate.message);
          }
          console.log('[albums.ts PUT] Storage paths migrated after album id rename:', {
            movedFiles: storageMigrate.movedFiles,
          });
        }

        const localePatch = data.translations?.[data.lang];
        const fullNameFromPatch =
          localePatch && typeof localePatch === 'object' && 'fullName' in localePatch
            ? String((localePatch as { fullName?: unknown }).fullName ?? '').trim()
            : '';
        const derivedAlbumTitle = deriveAlbumTitleFromFullName(fullNameFromPatch);
        /** Колонка `album` в БД: явный корень или вывод из fullName (иначе UI обновлялся по full_name, а album оставался старым). */
        const albumForDb: string | undefined = (() => {
          if (typeof data.album === 'string' && data.album.trim()) {
            return data.album.trim();
          }
          if (derivedAlbumTitle) return derivedAlbumTitle;
          if (typeof data.album === 'string') return data.album;
          return undefined;
        })();

        console.log('[albums.ts PUT] Searching for existing album:', {
          albumId: data.albumId,
          lang: data.lang,
          userId,
        });

        let existingAlbumResult;
        try {
          existingAlbumResult = await query<AlbumRow>(
            `SELECT * FROM albums 
            WHERE album_id = $1 AND lang = $2 
            AND user_id = $3
            ORDER BY created_at DESC
            LIMIT 1`,
            [data.albumId, data.lang, userId]
          );
          console.log('[albums.ts PUT] Album search result:', {
            found: existingAlbumResult.rows.length > 0,
            rowsCount: existingAlbumResult.rows.length,
          });
        } catch (searchError) {
          console.error('❌ [albums.ts PUT] Error searching for album:', searchError);
          throw searchError;
        }

        let existingAlbum: AlbumRow | undefined = existingAlbumResult.rows[0];

        // Нет строки для этой локали (например, есть только ru, а сохраняют в en): создаём строку и копируем треки с другой локали.
        if (!existingAlbum) {
          const siblingResult = await query<AlbumRow>(
            `SELECT * FROM albums 
             WHERE album_id = $1 AND user_id = $2 AND lang <> $3 
             ORDER BY updated_at DESC NULLS LAST, created_at DESC 
             LIMIT 1`,
            [data.albumId, userId, data.lang]
          );
          const sibling = siblingResult.rows[0];
          const legacyPatchAlbum =
            localePatch && typeof localePatch === 'object' && 'album' in localePatch
              ? String((localePatch as { album?: string }).album ?? '').trim()
              : '';
          const sharedAlbumTitle =
            (albumForDb !== undefined && String(albumForDb).trim() !== ''
              ? String(albumForDb).trim()
              : null) ||
            (typeof data.album === 'string' && data.album.trim()) ||
            legacyPatchAlbum ||
            (sibling.album || '').trim();
          if (sibling && sharedAlbumTitle) {
            const client = await getClient();
            try {
              await client.query('BEGIN');
              const releasePayloadRaw =
                data.release !== undefined ? data.release : (sibling.release ?? {});
              const releasePayload = stripReleaseCoverCredits(releasePayloadRaw);
              const buttonsPayload =
                data.buttons !== undefined ? data.buttons : (sibling.buttons ?? {});
              const coverVal =
                data.cover !== undefined && data.cover !== null && data.cover !== ''
                  ? data.cover
                  : sibling.cover;
              const detailsPayload =
                localePatch?.details !== undefined ? localePatch.details : (sibling.details ?? []);
              const fullNameVal =
                localePatch?.fullName !== undefined ? localePatch.fullName : sibling.full_name;
              const descVal =
                localePatch?.description !== undefined
                  ? localePatch.description
                  : sibling.description;
              const isPublicVal =
                data.isPublic !== undefined && sibling.is_published
                  ? data.isPublic
                  : sibling.is_public;
              const isPublishedVal = sibling.is_published;

              const photoVal =
                localePatch?.photographer !== undefined
                  ? localePatch.photographer
                  : sibling.photographer;
              const photoUrlVal =
                localePatch?.photographerURL !== undefined
                  ? localePatch.photographerURL
                  : sibling.photographer_url;
              const designVal =
                localePatch?.designer !== undefined ? localePatch.designer : sibling.designer;
              const designUrlVal =
                localePatch?.designerURL !== undefined
                  ? localePatch.designerURL
                  : sibling.designer_url;

              const insertRes = await client.query<AlbumRow>(
                `INSERT INTO albums (
                  user_id, album_id, artist, album, full_name, description,
                  cover, release, buttons, details, lang, is_public, is_published,
                  photographer, photographer_url, designer, designer_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *`,
                [
                  userId,
                  data.albumId,
                  sibling.artist || '',
                  sharedAlbumTitle,
                  fullNameVal,
                  descVal,
                  coverVal,
                  JSON.stringify(
                    releasePayload && typeof releasePayload === 'object' ? releasePayload : {}
                  ),
                  JSON.stringify(
                    buttonsPayload && typeof buttonsPayload === 'object' ? buttonsPayload : {}
                  ),
                  JSON.stringify(Array.isArray(detailsPayload) ? detailsPayload : []),
                  data.lang,
                  isPublicVal,
                  isPublishedVal,
                  photoVal ?? null,
                  photoUrlVal ?? null,
                  designVal ?? null,
                  designUrlVal ?? null,
                ]
              );
              const newAlbumPk = insertRes.rows[0].id;
              const hasVis = await tracksTableHasVisibilityColumn();
              const hasStemsVis = await tracksTableHasStemsVisibilityColumn();
              const hasAudioTech = await tracksTableHasAudioTechnicalColumns();
              const hasAudioFileMeta = await tracksTableHasAudioFileMetaColumns();
              const audioTechInsertCols = [
                hasAudioTech
                  ? ', audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels'
                  : '',
                hasAudioFileMeta ? ', audio_duration, audio_file_size' : '',
              ].join('');
              const audioTechSelectCols = [
                hasAudioTech
                  ? ', audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels'
                  : '',
                hasAudioFileMeta ? ', audio_duration, audio_file_size' : '',
              ].join('');
              if (hasVis && hasStemsVis) {
                await client.query(
                  `INSERT INTO tracks (
                  album_id, track_id, title, duration, src, content, authorship, order_index, visibility, stems_visibility${audioTechInsertCols}, updated_at
                )
                SELECT $1::uuid, track_id, title, duration, src, content, authorship, order_index,
                       COALESCE(visibility, 'public'), COALESCE(stems_visibility, 'public')${audioTechSelectCols}, NOW()
                FROM tracks WHERE album_id = $2::uuid`,
                  [newAlbumPk, sibling.id]
                );
              } else if (hasVis) {
                await client.query(
                  `INSERT INTO tracks (
                  album_id, track_id, title, duration, src, content, authorship, order_index, visibility${audioTechInsertCols}, updated_at
                )
                SELECT $1::uuid, track_id, title, duration, src, content, authorship, order_index,
                       COALESCE(visibility, 'public')${audioTechSelectCols}, NOW()
                FROM tracks WHERE album_id = $2::uuid`,
                  [newAlbumPk, sibling.id]
                );
              } else {
                await client.query(
                  `INSERT INTO tracks (
                  album_id, track_id, title, duration, src, content, authorship, order_index${audioTechInsertCols}, updated_at
                )
                SELECT $1::uuid, track_id, title, duration, src, content, authorship, order_index${audioTechSelectCols}, NOW()
                FROM tracks WHERE album_id = $2::uuid`,
                  [newAlbumPk, sibling.id]
                );
              }
              await client.query('COMMIT');
              existingAlbum = insertRes.rows[0];
              console.log('[albums.ts PUT] Created missing locale row and copied tracks', {
                albumId: data.albumId,
                lang: data.lang,
                siblingLang: sibling.lang,
                newAlbumPk,
              });
            } catch (createErr) {
              try {
                await client.query('ROLLBACK');
              } catch {
                // ignore rollback errors
              }
              console.error('[albums.ts PUT] Failed to create locale row:', createErr);
              throw createErr;
            } finally {
              client.release();
            }
          }
        }

        if (!existingAlbum) {
          console.warn('[albums.ts PUT] Album not found, returning 404:', {
            albumId: data.albumId,
            lang: data.lang,
            userId,
          });
          return createErrorResponse(404, 'Album not found or access denied.');
        }

        if (data.publish === true) {
          if (existingAlbum.is_published) {
            return createErrorResponse(400, 'Album is already published.');
          }

          const trackCountResult = await query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             WHERE a.user_id = $1 AND a.album_id = $2`,
            [userId, data.albumId]
          );
          const trackCount = Number(trackCountResult.rows[0]?.count ?? 0);

          const canonicalRowResult = await query<AlbumRow>(
            `SELECT * FROM albums
             WHERE user_id = $1 AND album_id = $2
             ORDER BY updated_at DESC NULLS LAST, created_at DESC
             LIMIT 1`,
            [userId, data.albumId]
          );
          const rowForCheck = canonicalRowResult.rows[0] ?? existingAlbum;

          if (!isAlbumRowReadyToPublish(rowForCheck, trackCount)) {
            return createErrorResponse(400, 'Album is not ready to publish.');
          }

          await syncSharedAlbumMetadataAcrossLocales(userId, data.albumId, {
            isPublished: true,
            isPublic: true,
          });

          const reloadedAfterPublish = await queryAlbumRowByPk(existingAlbum.id);
          if (reloadedAfterPublish) {
            existingAlbum = reloadedAfterPublish;
          }

          const tracksAfterPublish = { rows: await fetchTracksRowsForAlbumPk(existingAlbum.id) };
          const publishLyricsMap = await buildLyricsMapForAlbumTracks(
            existingAlbum.album_id,
            existingAlbum.user_id,
            tracksAfterPublish.rows,
            existingAlbum.lang
          );
          const publishedAlbum = mapAlbumToApiFormat(
            existingAlbum,
            tracksAfterPublish.rows,
            publishLyricsMap
          );

          return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              success: true,
              message: 'Album published successfully',
              data: [publishedAlbum],
            }),
          };
        }

        console.log('[albums.ts PUT] Found existing album:', {
          id: existingAlbum.id,
          albumId: existingAlbum.album_id,
          lang: existingAlbum.lang,
        });

        // 🔍 DEBUG: Проверяем, что пришло в запросе
        console.log('[albums.ts PUT] Request data:', {
          albumId: data.albumId,
          cover: data.cover,
          coverType: typeof data.cover,
          coverUndefined: data.cover === undefined,
          coverNull: data.cover === null,
          coverEmpty: data.cover === '',
          allDataKeys: Object.keys(data),
        });

        const updateFields: string[] = [];
        const updateValues: unknown[] = [];
        let paramIndex = 1;

        if (albumForDb !== undefined) {
          updateFields.push(`album = $${paramIndex++}`);
          updateValues.push(albumForDb);
        }
        if (localePatch?.fullName !== undefined) {
          updateFields.push(`full_name = $${paramIndex++}`);
          updateValues.push(localePatch.fullName);
        }
        if (localePatch?.description !== undefined) {
          updateFields.push(`description = $${paramIndex++}`);
          updateValues.push(localePatch.description);
        }
        if (localePatch?.details !== undefined) {
          updateFields.push(`details = $${paramIndex++}::jsonb`);
          updateValues.push(JSON.stringify(localePatch.details));
        }
        if (localePatch && typeof localePatch === 'object') {
          const lp = localePatch as Record<string, unknown>;
          if ('photographer' in lp) {
            updateFields.push(`photographer = $${paramIndex++}`);
            updateValues.push(lp.photographer == null ? '' : String(lp.photographer));
          }
          if ('photographerURL' in lp) {
            updateFields.push(`photographer_url = $${paramIndex++}`);
            updateValues.push(lp.photographerURL == null ? '' : String(lp.photographerURL));
          }
          if ('designer' in lp) {
            updateFields.push(`designer = $${paramIndex++}`);
            updateValues.push(lp.designer == null ? '' : String(lp.designer));
          }
          if ('designerURL' in lp) {
            updateFields.push(`designer_url = $${paramIndex++}`);
            updateValues.push(lp.designerURL == null ? '' : String(lp.designerURL));
          }
        }
        if (data.cover !== undefined && data.cover !== null && data.cover !== '') {
          updateFields.push(`cover = $${paramIndex++}::text`);
          updateValues.push(data.cover);
          console.log('[albums.ts PUT] ✅ Cover will be updated to:', data.cover);
        } else {
          console.log('[albums.ts PUT] ⚠️ Cover NOT updated:', {
            cover: data.cover,
            undefined: data.cover === undefined,
            null: data.cover === null,
            empty: data.cover === '',
          });
        }
        if (data.release !== undefined) {
          updateFields.push(`release = $${paramIndex++}::jsonb`);
          updateValues.push(JSON.stringify(stripReleaseCoverCredits(data.release)));
        }
        if (data.buttons !== undefined) {
          updateFields.push(`buttons = $${paramIndex++}::jsonb`);
          updateValues.push(JSON.stringify(data.buttons));
        }
        if (data.isPublic !== undefined) {
          if (!existingAlbum.is_published) {
            console.log(
              '[albums.ts PUT] Ignoring isPublic on draft album (use publish: true to publish)'
            );
          } else {
            updateFields.push(`is_public = $${paramIndex++}`);
            updateValues.push(data.isPublic);
          }
        }

        if (updateFields.length === 0 && !albumIdRenameApplied) {
          return createErrorResponse(400, 'No fields to update.');
        }

        let updatedAlbum: AlbumRow;

        if (updateFields.length === 0 && albumIdRenameApplied) {
          const reloaded = await queryAlbumRowByPk(existingAlbum.id);
          if (!reloaded) {
            return createErrorResponse(500, 'Album reload failed after rename.');
          }
          updatedAlbum = reloaded;
        } else {
          updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

          // 🔍 DEBUG: Проверяем, что будет отправлено в БД
          console.log('[albums.ts PUT] Update query fields:', updateFields);
          console.log('[albums.ts PUT] Update query values:', updateValues);
          const coverIndex = updateFields.findIndex((f) => f.includes('cover'));
          if (coverIndex >= 0) {
            console.log('[albums.ts PUT] Cover will be updated:', {
              field: updateFields[coverIndex],
              value: updateValues[coverIndex],
            });
          } else {
            console.log('[albums.ts PUT] ⚠️ Cover NOT in updateFields!');
          }

          // Добавляем условия WHERE
          updateValues.push(existingAlbum.id);

          // Обновляем альбом в БД
          const updateQuery = `
        UPDATE albums 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

          console.log('[albums.ts PUT] Executing update query:', {
            query: updateQuery.substring(0, 200),
            paramsCount: updateValues.length,
            fieldsCount: updateFields.length,
          });

          let updateResult;
          try {
            updateResult = await query<AlbumRow>(updateQuery, updateValues);
            console.log('[albums.ts PUT] Update query executed successfully:', {
              rowsUpdated: updateResult.rows.length,
            });
          } catch (updateError) {
            console.error('❌ [albums.ts PUT] Error executing update query:', updateError);
            console.error('❌ [albums.ts PUT] Update query was:', updateQuery);
            console.error('❌ [albums.ts PUT] Update values were:', updateValues);
            throw updateError;
          }

          if (updateResult.rows.length === 0) {
            console.error('❌ [albums.ts PUT] Update query returned 0 rows:', {
              albumId: data.albumId,
              existingAlbumId: existingAlbum.id,
            });
            return createErrorResponse(500, 'Album update failed: no rows affected.');
          }

          updatedAlbum = updateResult.rows[0];
          const reloadedAfterUpdate = await queryAlbumRowByPk(updatedAlbum.id);
          if (reloadedAfterUpdate) {
            updatedAlbum = reloadedAfterUpdate;
          }
        }

        const syncAlbum = albumForDb !== undefined ? String(albumForDb) : undefined;
        const syncRelease =
          data.release !== undefined
            ? JSON.stringify(stripReleaseCoverCredits(data.release))
            : undefined;
        const syncPub =
          data.isPublic !== undefined && existingAlbum.is_published ? data.isPublic : undefined;
        const syncCover =
          data.cover !== undefined && data.cover !== null && data.cover !== ''
            ? String(data.cover)
            : undefined;
        const syncButtons = data.buttons !== undefined ? JSON.stringify(data.buttons) : undefined;
        if (
          syncAlbum !== undefined ||
          syncRelease !== undefined ||
          syncPub !== undefined ||
          syncCover !== undefined ||
          syncButtons !== undefined
        ) {
          await syncSharedAlbumMetadataAcrossLocales(userId, data.albumId, {
            album: syncAlbum,
            releaseJson: syncRelease,
            isPublic: syncPub,
            cover: syncCover,
            buttonsJson: syncButtons,
          });
        }

        // Гарантированно обновляем `album` у всех строк локалей (один album_id), если есть непустое название.
        if (albumForDb !== undefined && String(albumForDb).trim() !== '') {
          await query(
            `UPDATE albums SET album = $1, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2 AND album_id = $3`,
            [String(albumForDb).trim(), userId, data.albumId]
          );
          const refreshed = await queryAlbumRowByPk(updatedAlbum.id);
          if (refreshed) {
            updatedAlbum = refreshed;
          }
        }

        // 🔍 DEBUG: Проверяем, что пришло из БД
        console.log('[albums.ts PUT] Raw cover from DB:', {
          type: typeof updatedAlbum.cover,
          value: updatedAlbum.cover,
          stringified: JSON.stringify(updatedAlbum.cover),
        });

        // Загружаем треки для обновлённого альбома
        let tracksResult: { rows: TrackRow[] };
        try {
          tracksResult = { rows: await fetchTracksRowsForAlbumPk(updatedAlbum.id) };
          console.log('[albums.ts PUT] Tracks loaded:', {
            count: tracksResult.rows.length,
          });
        } catch (tracksError) {
          console.error('❌ [albums.ts PUT] Error loading tracks:', tracksError);
          throw tracksError;
        }

        let mappedAlbum;
        try {
          const putLyricsMap = await buildLyricsMapForAlbumTracks(
            updatedAlbum.album_id,
            updatedAlbum.user_id,
            tracksResult.rows,
            updatedAlbum.lang
          );
          mappedAlbum = mapAlbumToApiFormat(updatedAlbum, tracksResult.rows, putLyricsMap);
          console.log('[albums.ts PUT] Album mapped successfully');
        } catch (mapError) {
          console.error('❌ [albums.ts PUT] Error mapping album:', mapError);
          throw mapError;
        }

        // 🔍 DEBUG: Проверяем, что получилось после маппинга
        console.log('[albums.ts PUT] Mapped album:', {
          albumId: mappedAlbum.albumId,
          album: mappedAlbum.album, // Должно быть новое значение
          artistDisplayName: mappedAlbum.artistDisplayName,
          description: mappedAlbum.description?.substring(0, 50) || '',
          cover: mappedAlbum.cover,
          type: typeof mappedAlbum.cover,
          stringified: JSON.stringify(mappedAlbum.cover),
        });

        // Сохраняем в JSON через GitHub API (асинхронно, не блокируем ответ)
        const githubToken = process.env.GITHUB_TOKEN;
        if (githubToken) {
          // Загружаем все альбомы пользователя для обновления JSON
          const allAlbumsResult = await query<AlbumRow>(
            `SELECT a.*,
                    ${ARTIST_DISPLAY_NAME_SQL} AS artist_display_name
          FROM albums a
          ${ALBUMS_USER_JOIN_SQL}
          WHERE a.lang = $1 
            AND a.user_id = $2
          ORDER BY a.created_at DESC`,
            [data.lang, userId]
          );

          // Загружаем треки для всех альбомов
          const allAlbumsWithTracks = await Promise.all(
            allAlbumsResult.rows.map(async (album) => {
              // Загружаем треки по конкретному UUID альбома
              // Важно: фильтруем по конкретному альбому (UUID), чтобы не получить треки из других альбомов
              const tr = await fetchTracksRowsForAlbumPk(album.id);
              const lyricsMap = await buildLyricsMapForAlbumTracks(
                album.album_id,
                album.user_id,
                tr,
                album.lang
              );
              return mapAlbumToApiFormat(album, tr, lyricsMap);
            })
          );

          // Преобразуем в формат AlbumEditable для JSON
          const albumsForJson = allAlbumsWithTracks.map((album) => ({
            albumId: album.albumId,
            album: album.album,
            fullName: album.fullName,
            description: album.description,
            cover: album.cover,
            release: album.release,
            buttons: album.buttons,
            details: album.details,
            tracks: album.tracks.map((track) => {
              return {
                id: normalizeTrackIdString(track.id),
                title: track.title,
                order_index: track.order_index ?? 0,
                duration: track.duration,
                src: track.src || '',
                content: track.content || '',
                authorship: track.authorship || undefined,
                lyrics: track.lyrics || undefined,
                visibility: track.visibility || 'public',
                stemsVisibility: track.stemsVisibility || 'public',
              };
            }),
          }));

          // Обновляем JSON файл (не ждём результата)
          updateAlbumsJson(data.lang, albumsForJson, data.albumId, githubToken).catch((error) => {
            console.error('❌ Failed to update JSON file in GitHub:', error);
          });
        } else {
          console.warn('⚠️ GITHUB_TOKEN not set, skipping JSON update');
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            message: 'Album updated successfully',
            data: [mappedAlbum],
          }),
        };
      } catch (putError) {
        console.error('❌ Error in PUT /api/albums:', putError);
        return handleError(putError, 'albums PUT function');
      }
    }

    // DELETE: удаление трека или альбома (требует авторизации)
    // PATCH: обновление порядка треков
    if (event.httpMethod === 'PATCH') {
      try {
        const userId = requireArtistAccount(event);
        if (!userId) {
          return requireAuth(event)
            ? forbiddenArtistAccountResponse(event)
            : unauthorizedFromAuthHeader(event);
        }

        const data = parseJsonBody<{
          albumId: string;
          lang: SupportedLang;
          trackOrders: Array<{ trackId: string; orderIndex: number }>;
        }>(event.body, {} as any);

        if (!data.albumId || !data.lang || !Array.isArray(data.trackOrders)) {
          return createErrorResponse(
            400,
            'Missing required fields: albumId, lang, trackOrders (ordered array of { trackId }, optional orderIndex ignored)'
          );
        }

        console.log('🔄 PATCH /api/albums - Reorder tracks request:', {
          albumId: data.albumId,
          lang: data.lang,
          trackOrders: data.trackOrders,
          userId,
        });

        // Находим все языковые версии альбома пользователя
        const albumRowsResult = await query<{ id: string; lang: string }>(
          `SELECT id, lang FROM albums
           WHERE album_id = $1 AND user_id = $2
           ORDER BY CASE WHEN lang = $3 THEN 0 ELSE 1 END, created_at DESC`,
          [data.albumId, userId, data.lang]
        );

        if (albumRowsResult.rows.length === 0) {
          return createErrorResponse(404, 'Album not found.');
        }

        const album = albumRowsResult.rows[0];
        const albumDbIds = albumRowsResult.rows.map((row) => row.id);

        const orderedIds = data.trackOrders.map(
          (row) => normalizeTrackIdString(row.trackId) || String(row.trackId)
        );
        if (new Set(orderedIds).size !== orderedIds.length) {
          return createErrorResponse(400, 'Duplicate trackId in trackOrders.');
        }

        const dbTracks = await query<{ track_id: string }>(
          `SELECT track_id FROM tracks WHERE album_id = $1`,
          [album.id]
        );
        const dbSet = new Set(
          dbTracks.rows.map((r) => normalizeTrackIdString(r.track_id) || String(r.track_id))
        );
        if (orderedIds.length !== dbSet.size || !orderedIds.every((id) => dbSet.has(id))) {
          return createErrorResponse(
            400,
            'trackOrders must list every track in the album exactly once (order only; client orderIndex is ignored).'
          );
        }

        const client = await getClient();
        try {
          await client.query('BEGIN');
          for (const albumDbId of albumDbIds) {
            await client.query(`SELECT id FROM albums WHERE id = $1 FOR UPDATE`, [albumDbId]);
            for (let i = 0; i < orderedIds.length; i++) {
              const orderIndex = rankToOrderIndex(i);
              await client.query(
                `UPDATE tracks 
                 SET order_index = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE album_id = $2 AND track_id = $3`,
                [orderIndex, albumDbId, orderedIds[i]]
              );
            }
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        } finally {
          client.release();
        }

        console.log('✅ PATCH /api/albums - Tracks reordered:', {
          albumId: data.albumId,
          lang: data.lang,
          tracksCount: orderedIds.length,
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            message: 'Tracks reordered successfully',
          }),
        };
      } catch (reorderError) {
        console.error('❌ Error in PATCH /api/albums:', reorderError);
        return handleError(reorderError, 'albums PATCH function');
      }
    }

    if (event.httpMethod === 'DELETE') {
      try {
        const userId = requireArtistAccount(event);

        if (!userId) {
          return requireAuth(event)
            ? forbiddenArtistAccountResponse(event)
            : unauthorizedFromAuthHeader(event);
        }

        // Проверяем query параметры для удаления трека
        const queryParams = event.queryStringParameters || {};
        const trackId = queryParams.trackId;
        const albumIdFromQuery = queryParams.albumId;
        const langFromQuery = queryParams.lang;

        // Если есть trackId в query параметрах, удаляем трек
        if (trackId && albumIdFromQuery && langFromQuery) {
          if (!validateLang(langFromQuery)) {
            return createErrorResponse(400, 'Invalid lang parameter. Must be "en" or "ru"');
          }

          console.log('🗑️ DELETE /api/albums - Delete track request:', {
            albumId: albumIdFromQuery,
            trackId,
            lang: langFromQuery,
            userId,
          });

          // Треки привязаны к UUID строки albums (отдельные строки на ru/en). Нельзя искать только
          // по lang из UI: трек, загруженный в русской версии, иначе не находится при удалении из EN.
          const hasPipeline = await tracksTableHasPipelineColumns();
          const hasAssetsTable = await trackAssetsTableExists();
          const masterPathCol = hasPipeline ? 't.master_path' : 'NULL::text AS master_path';

          const trackOwnerResult = await query<{
            src: string | null;
            master_path: string | null;
            track_db_id: string;
            album_pk: string;
            lang: string;
          }>(
            `SELECT t.src, ${masterPathCol}, t.id AS track_db_id, a.id AS album_pk, a.lang
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             WHERE a.user_id = $1
               AND a.album_id = $2
               AND t.track_id = $3
             ORDER BY CASE WHEN a.lang = $4 THEN 0 ELSE 1 END,
                      a.updated_at DESC NULLS LAST,
                      a.created_at DESC
             LIMIT 1`,
            [userId, albumIdFromQuery, String(trackId), langFromQuery]
          );

          if (trackOwnerResult.rows.length === 0) {
            return createErrorResponse(404, 'Track not found.');
          }

          const trackRow = trackOwnerResult.rows[0];

          const assetPathsResult = hasAssetsTable
            ? await query<{ path: string | null }>(
                `SELECT path FROM track_assets WHERE track_id = $1::uuid AND path IS NOT NULL`,
                [trackRow.track_db_id]
              ).catch(() => ({ rows: [] as { path: string | null }[] }))
            : { rows: [] as { path: string | null }[] };

          const storagePathsToRemove = new Set<string>();
          for (const candidate of [
            trackRow.master_path,
            trackRow.src,
            ...assetPathsResult.rows.map((r) => r.path),
          ]) {
            if (!candidate?.trim()) continue;
            const extracted = extractStoragePathFromTrackRef(candidate, userId);
            if (extracted) storagePathsToRemove.add(extracted);
          }

          if (storagePathsToRemove.size > 0) {
            void removeTrackStoragePaths([...storagePathsToRemove]);
          }

          // Удаляем трек из базы данных во всех языковых версиях альбома
          const deleteTrackResult = await query(
            `DELETE FROM tracks t
             USING albums a
             WHERE t.album_id = a.id
               AND a.user_id = $1
               AND a.album_id = $2
               AND t.track_id = $3
             RETURNING t.id`,
            [userId, albumIdFromQuery, String(trackId)]
          );

          if (deleteTrackResult.rows.length === 0) {
            return createErrorResponse(404, 'Track not found.');
          }

          // Синхронизации: album_id в таблице — строковый album_id; убираем все локали для трека.
          await query(
            `DELETE FROM synced_lyrics 
             WHERE album_id = $1 AND track_id = $2`,
            [albumIdFromQuery, String(trackId)]
          );

          console.log('✅ DELETE /api/albums - Track deleted:', {
            albumId: albumIdFromQuery,
            trackId,
            uiLang: langFromQuery,
            trackRowLang: trackRow.lang,
          });

          const remainingTracksResult = await query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             WHERE a.user_id = $1 AND a.album_id = $2`,
            [userId, albumIdFromQuery]
          );
          const remainingTrackCount = Number(remainingTracksResult.rows[0]?.count ?? 0);

          if (remainingTrackCount === 0) {
            await syncSharedAlbumMetadataAcrossLocales(userId, albumIdFromQuery, {
              isPublic: false,
              isPublished: false,
            });
            console.log('📋 DELETE /api/albums - Album reverted to draft (no tracks left):', {
              albumId: albumIdFromQuery,
            });
          }

          return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              success: true,
              message: 'Track deleted successfully',
            }),
          };
        }

        // Иначе удаляем альбом (оригинальная логика)
        let data: { albumId: string; lang: string };
        try {
          data = parseJsonBody<{ albumId: string; lang: string }>(
            event.body,
            {} as { albumId: string; lang: string }
          );
        } catch (error) {
          return createErrorResponse(
            400,
            error instanceof Error ? error.message : 'Invalid JSON body'
          );
        }

        if (!data.albumId || !data.lang || !validateLang(data.lang)) {
          return createErrorResponse(
            400,
            'Missing required fields: albumId, lang (must be "en" or "ru")'
          );
        }

        console.log('🗑️ DELETE /api/albums - Request data:', {
          albumId: data.albumId,
          lang: data.lang,
          userId,
        });

        // Сначала находим все записи альбома пользователя (все языковые версии)
        const findAlbumsResult = await query<AlbumRow>(
          `SELECT id, album_id, lang, user_id, cover FROM albums 
          WHERE album_id = $1 
            AND user_id = $2`,
          [data.albumId, userId]
        );

        if (findAlbumsResult.rows.length === 0) {
          return createErrorResponse(
            404,
            'Album not found or you do not have permission to delete it.'
          );
        }

        const albumIds = findAlbumsResult.rows.map((row) => row.id);
        const coversToDelete = findAlbumsResult.rows
          .map((row) => row.cover)
          .filter((cover): cover is string => !!cover);

        // Удаляем все треки альбома (для всех языковых версий)
        if (albumIds.length > 0) {
          await query(`DELETE FROM tracks WHERE album_id = ANY($1::uuid[])`, [albumIds]);
        }

        // Удаляем все синхронизированные тексты альбома пользователя (для всех языковых версий)
        await query(
          `DELETE FROM synced_lyrics 
          WHERE album_id = $1 
            AND user_id = $2`,
          [data.albumId, userId]
        );

        // Удаляем все языковые версии альбома пользователя
        const deleteResult = await query<AlbumRow>(
          `DELETE FROM albums 
          WHERE album_id = $1 
            AND user_id = $2
          RETURNING *`,
          [data.albumId, userId]
        );

        // Удаляем обложки альбома из Supabase Storage
        // Собираем все уникальные обложки из всех удаленных записей
        const uniqueCovers = Array.from(
          new Set(
            deleteResult.rows.map((row) => row.cover).filter((cover): cover is string => !!cover)
          )
        );

        if (uniqueCovers.length > 0) {
          try {
            // Импортируем Supabase клиент
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

            if (supabaseUrl && serviceRoleKey) {
              const supabase = createClient(supabaseUrl, serviceRoleKey, {
                auth: {
                  persistSession: false,
                  autoRefreshToken: false,
                  detectSessionInUrl: false,
                },
              });

              const STORAGE_BUCKET_NAME = 'user-media';

              // Формируем пути для всех вариантов всех обложек
              const allCoverPaths: string[] = [];
              for (const coverBaseName of uniqueCovers) {
                const coverVariants = [
                  `${coverBaseName}-64.webp`,
                  `${coverBaseName}-128.webp`,
                  `${coverBaseName}-448.webp`,
                  `${coverBaseName}-896.webp`,
                  `${coverBaseName}-1344.webp`,
                  `${coverBaseName}-64.jpg`,
                  `${coverBaseName}-128.jpg`,
                  `${coverBaseName}-448.jpg`,
                  `${coverBaseName}-896.jpg`,
                  `${coverBaseName}-1344.jpg`,
                ];

                const coverPaths = coverVariants.map(
                  (variant) => `users/${userId}/albums/${variant}`
                );
                allCoverPaths.push(...coverPaths);
              }

              // Удаляем все варианты всех обложек
              if (allCoverPaths.length > 0) {
                const { error: deleteError } = await supabase.storage
                  .from(STORAGE_BUCKET_NAME)
                  .remove(allCoverPaths);

                if (deleteError) {
                  console.warn('⚠️ Failed to delete cover files from storage:', deleteError);
                } else {
                  console.log('✅ Cover files deleted from storage:', {
                    albumId: data.albumId,
                    coversCount: uniqueCovers.length,
                    variantsCount: allCoverPaths.length,
                  });
                }
              }
            }
          } catch (coverDeleteError) {
            console.warn('⚠️ Error deleting cover files (non-critical):', coverDeleteError);
            // Не блокируем удаление альбома, если обложки не удалились
          }
        }

        console.log('✅ DELETE /api/albums - Album deleted:', {
          albumId: data.albumId,
          lang: data.lang,
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            message: 'Album deleted successfully',
          }),
        };
      } catch (deleteError) {
        console.error('❌ Error in DELETE /api/albums:', deleteError);
        return handleError(deleteError, 'albums DELETE function');
      }
    }

    // Неподдерживаемый метод
    return createErrorResponse(405, 'Method not allowed. Use GET, POST, PUT, PATCH, or DELETE.');
  } catch (error) {
    return handleError(error, 'albums function');
  }
};
