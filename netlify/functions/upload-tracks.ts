/**
 * Netlify Serverless Function для сохранения метаданных треков в базу данных
 *
 * ВАЖНО: Файлы должны быть загружены в Supabase Storage с клиента ДО вызова этой функции.
 * Эта функция только сохраняет метаданные в БД.
 *
 * Использование:
 * POST /api/tracks/upload
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   albumId: string (album_id, например "23"),
 *   lang: string ('ru' или 'en'),
 *   tracks: Array<{
 *     fileName: string,
 *     title: string,
 *     duration: number (в секундах),
 *     trackId: string (стабильный id: UUID для новых треков или legacy "1","2",…),
 *     orderIndex?: number (игнорируется — сервер назначает шагом после MAX под блокировкой альбома),
 *     storagePath: string (путь к файлу в Storage),
 *     url: string (публичный URL файла),
 *     audioContainer?: string | null,
 *     audioCodec?: string | null,
 *     audioBitrate?: number | null,
 *     audioSampleRate?: number | null,
 *     audioBitDepth?: number | null,
 *     audioChannels?: number | null
 *   }>
 * }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  requireArtistAccount,
  forbiddenArtistAccountResponse,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';
import { getClient, query } from './lib/db';
import { resolveTrackSrcToSupabasePublicUrl } from './lib/storage-public-url';
import { TRACK_ORDER_INDEX_STEP } from '../../src/shared/lib/tracks/trackOrderIndex';
import { tracksTableHasPipelineColumns, trackAssetsTableExists } from './lib/track-pipeline-schema';
import { enqueueTrackProcessing } from './lib/enqueueTrackProcessing';
import { markTrackProcessingEnqueueFailed } from './lib/trackProcessingFailure';
import {
  GENERATOR_VERSIONS,
  PIPELINE_STAGES,
} from '../../src/shared/lib/audio/audioAssetPipelineConfig';
import {
  collectSupersededTrackStoragePaths,
  removeTrackStoragePaths,
} from './lib/track-storage-cleanup';

interface TrackUploadRequest {
  albumId: string;
  lang: string;
  tracks: Array<{
    fileName: string;
    duration: number;
    trackId: string;
    orderIndex?: number;
    storagePath: string;
    url: string;
    /** Название для текущей локали — только translations[lang].title */
    translations: Partial<Record<'en' | 'ru', { title: string }>>;
    audioContainer?: string | null;
    audioCodec?: string | null;
    audioBitrate?: number | null;
    audioSampleRate?: number | null;
    audioBitDepth?: number | null;
    audioChannels?: number | null;
    audioDuration?: number | null;
    audioFileSize?: number | null;
  }>;
}

function optionalPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

function optionalPositiveDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function optionalTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLen);
}

interface TrackUploadResponse {
  success: boolean;
  data?: Array<{
    trackId: string;
    title: string;
    url: string;
    storagePath: string;
    processingStatus?: string;
    processingError?: string;
  }>;
  error?: string;
}

async function seedPendingAssetRows(
  client: Awaited<ReturnType<typeof getClient>>,
  trackDbId: string
) {
  for (const stage of PIPELINE_STAGES) {
    if (!stage.enabled) continue;
    for (const output of stage.outputs) {
      const generatorVersion = GENERATOR_VERSIONS[output.generator] ?? 1;
      await client.query(
        `INSERT INTO track_assets (
          track_id, type, format, variant, generator, generator_version, status, path, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NULL, '{}')
        ON CONFLICT (track_id, type, format, variant)
        DO UPDATE SET
          generator = EXCLUDED.generator,
          generator_version = EXCLUDED.generator_version,
          status = 'pending',
          path = NULL,
          error = NULL,
          metadata = '{}',
          updated_at = CURRENT_TIMESTAMP`,
        [trackDbId, output.type, output.format, output.variant, output.generator, generatorVersion]
      );
    }
  }
}

// Функция getStoragePath больше не нужна - файлы загружаются с клиента напрямую в Supabase Storage

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
    // Проверяем авторизацию
    const userId = requireArtistAccount(event);
    if (!userId) {
      return requireAuth(event)
        ? forbiddenArtistAccountResponse(event)
        : unauthorizedFromAuthHeader(event);
    }

    // Парсим JSON body
    const body = parseJsonBody<Partial<TrackUploadRequest>>(event.body, {});

    const { albumId, lang, tracks } = body;

    if (!albumId || !lang || !tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return createErrorResponse(
        400,
        'Missing required fields: albumId (string), lang (string), tracks (array with at least one track)'
      );
    }

    // Проверяем, что альбом существует и принадлежит пользователю
    // Ищем по album_id (строка) и lang, так как альбомы уникальны по (user_id, album_id, lang)
    const albumResult = await query<{ id: string; user_id: string | null; album_id: string }>(
      'SELECT id, user_id, album_id FROM albums WHERE album_id = $1 AND lang = $2 AND user_id = $3',
      [albumId, lang, userId]
    );

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d98fd1d-24ff-4297-901e-115ee9f70125', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'upload-tracks.ts:97',
        message: 'Album lookup result',
        data: {
          albumId,
          lang,
          userId,
          found: albumResult.rows.length > 0,
          albumDbId: albumResult.rows[0]?.id,
          albumStringId: albumResult.rows[0]?.album_id,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      }),
    }).catch(() => {});
    // #endregion

    if (albumResult.rows.length === 0) {
      return createErrorResponse(404, 'Album not found');
    }

    const album = albumResult.rows[0];
    if (album.user_id !== userId) {
      return createErrorResponse(403, 'Forbidden. You can only upload tracks to your own albums.');
    }

    const uploadedTracks: TrackUploadResponse['data'] = [];
    const hasPipeline = await tracksTableHasPipelineColumns();
    const hasAssetsTable = await trackAssetsTableExists();
    const enqueueJobs: Array<{
      trackDbId: string;
      trackId: string;
      masterPath: string;
    }> = [];
    const storagePathsToRemoveAfterCommit: string[] = [];

    const tracksToSave = tracks.filter((t) => {
      const titleForLang = t.translations?.[lang as 'en' | 'ru']?.title?.trim() ?? '';
      const ok = !!(t.fileName && titleForLang && t.trackId && t.storagePath && t.url);
      if (!ok) {
        console.warn('⚠️ [upload-tracks] Skipping track with missing required fields:', {
          trackId: t.trackId,
          titleForLang,
          fileName: t.fileName,
          hasStoragePath: !!t.storagePath,
          hasUrl: !!t.url,
        });
      }
      return ok;
    });

    if (tracksToSave.length === 0) {
      return createErrorResponse(
        400,
        'No valid tracks to save (each needs fileName, translations[lang].title, trackId, storagePath, url).'
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM albums WHERE id = $1 FOR UPDATE', [album.id]);

      const maxRes = await client.query<{ max_idx: string }>(
        'SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM tracks WHERE album_id = $1',
        [album.id]
      );
      let nextOrderIndex = Number(maxRes.rows[0]?.max_idx ?? 0) + TRACK_ORDER_INDEX_STEP;

      for (const track of tracksToSave) {
        const { fileName, duration, trackId, storagePath, url } = track;
        const title = track.translations?.[lang as 'en' | 'ru']?.title?.trim() ?? '';
        const existingTrackRes = await client.query<{
          id: string;
          master_path: string | null;
          order_index: number;
        }>(
          `SELECT id, master_path, order_index FROM tracks WHERE album_id = $1 AND track_id = $2 LIMIT 1`,
          [album.id, trackId]
        );
        const isReupload = existingTrackRes.rows.length > 0;
        const assignedOrderIndex = isReupload
          ? Number(existingTrackRes.rows[0].order_index)
          : nextOrderIndex;
        if (!isReupload) {
          nextOrderIndex += TRACK_ORDER_INDEX_STEP;
        }

        console.log('💾 [upload-tracks] Saving track to DB:', {
          albumId: album.id,
          trackId,
          title,
          duration,
          url,
          assignedOrderIndex,
        });

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0d98fd1d-24ff-4297-901e-115ee9f70125', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'upload-tracks.ts:161',
            message: 'Saving track to DB - before insert',
            data: {
              albumDbId: album.id,
              albumStringId: album.album_id,
              trackId,
              title,
              duration,
              url,
              orderIndex: assignedOrderIndex,
              hasUrl: !!url,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'E',
          }),
        }).catch(() => {});
        // #endregion

        const masterPathForDb = storagePath.startsWith('users/')
          ? storagePath
          : storagePath.replace(/^\/+/, '');
        const srcForDb = hasPipeline
          ? ''
          : (resolveTrackSrcToSupabasePublicUrl(url, album.user_id) ?? url);
        const audioContainer = optionalTrimmedString(track.audioContainer, 32);
        const audioCodec = optionalTrimmedString(track.audioCodec, 64);
        const audioBitrate = optionalPositiveInt(track.audioBitrate);
        const audioSampleRate = optionalPositiveInt(track.audioSampleRate);
        const audioBitDepth = optionalPositiveInt(track.audioBitDepth);
        const audioChannels = optionalPositiveInt(track.audioChannels);
        const audioDuration =
          optionalPositiveDuration(track.audioDuration) ?? optionalPositiveDuration(duration);
        const audioFileSize = optionalPositiveInt(track.audioFileSize);
        const durationForDb = audioDuration ?? duration;

        if (hasPipeline && hasAssetsTable && isReupload) {
          const existingRow = existingTrackRes.rows[0];
          const assetPathsRes = await client.query<{ path: string | null }>(
            `SELECT path FROM track_assets WHERE track_id = $1::uuid AND path IS NOT NULL`,
            [existingRow.id]
          );
          storagePathsToRemoveAfterCommit.push(
            ...collectSupersededTrackStoragePaths(
              userId,
              masterPathForDb,
              existingRow.master_path,
              assetPathsRes.rows.map((row) => row.path)
            )
          );
        }

        const insertResult = hasPipeline
          ? await client.query(
              `INSERT INTO tracks (
        album_id, track_id, title, duration, src, order_index,
        audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels,
        audio_duration, audio_file_size,
        master_path, processing_status, processing_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', NULL)
      ON CONFLICT (album_id, track_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        duration = EXCLUDED.duration,
        src = EXCLUDED.src,
        order_index = EXCLUDED.order_index,
        audio_container = EXCLUDED.audio_container,
        audio_codec = EXCLUDED.audio_codec,
        audio_bitrate = EXCLUDED.audio_bitrate,
        audio_sample_rate = EXCLUDED.audio_sample_rate,
        audio_bit_depth = EXCLUDED.audio_bit_depth,
        audio_channels = EXCLUDED.audio_channels,
        audio_duration = EXCLUDED.audio_duration,
        audio_file_size = EXCLUDED.audio_file_size,
        master_path = EXCLUDED.master_path,
        processing_status = 'pending',
        processing_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, track_id, title`,
              [
                album.id,
                trackId,
                title,
                durationForDb,
                srcForDb,
                assignedOrderIndex,
                audioContainer,
                audioCodec,
                audioBitrate,
                audioSampleRate,
                audioBitDepth,
                audioChannels,
                audioDuration,
                audioFileSize,
                masterPathForDb,
              ]
            )
          : await client.query(
              `INSERT INTO tracks (
        album_id, track_id, title, duration, src, order_index,
        audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels,
        audio_duration, audio_file_size
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (album_id, track_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        duration = EXCLUDED.duration,
        src = EXCLUDED.src,
        order_index = EXCLUDED.order_index,
        audio_container = EXCLUDED.audio_container,
        audio_codec = EXCLUDED.audio_codec,
        audio_bitrate = EXCLUDED.audio_bitrate,
        audio_sample_rate = EXCLUDED.audio_sample_rate,
        audio_bit_depth = EXCLUDED.audio_bit_depth,
        audio_channels = EXCLUDED.audio_channels,
        audio_duration = EXCLUDED.audio_duration,
        audio_file_size = EXCLUDED.audio_file_size,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, track_id, title`,
              [
                album.id,
                trackId,
                title,
                durationForDb,
                srcForDb,
                assignedOrderIndex,
                audioContainer,
                audioCodec,
                audioBitrate,
                audioSampleRate,
                audioBitDepth,
                audioChannels,
                audioDuration,
                audioFileSize,
              ]
            );

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0d98fd1d-24ff-4297-901e-115ee9f70125', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'upload-tracks.ts:176',
            message: 'Track saved to DB - after insert',
            data: {
              albumDbId: album.id,
              albumStringId: album.album_id,
              trackId,
              title,
              saved: insertResult.rows.length > 0,
              savedTrackId: insertResult.rows[0]?.track_id,
              savedDbId: insertResult.rows[0]?.id,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'F',
          }),
        }).catch(() => {});
        // #endregion

        if (insertResult.rows.length > 0) {
          const savedTrack = insertResult.rows[0];
          const trackDbId = savedTrack.id as string;

          if (hasPipeline && hasAssetsTable) {
            await seedPendingAssetRows(client, trackDbId);
            enqueueJobs.push({
              trackDbId,
              trackId,
              masterPath: masterPathForDb,
            });
          }

          console.log('✅ [upload-tracks] Track saved to DB:', {
            trackId: savedTrack.track_id,
            title: savedTrack.title,
            dbId: savedTrack.id,
            orderIndex: assignedOrderIndex,
            hasPipeline,
          });

          uploadedTracks.push({
            trackId,
            title,
            url: hasPipeline ? '' : url,
            storagePath,
            processingStatus: hasPipeline ? 'pending' : undefined,
          });
        } else {
          throw new Error(`Track not saved — no rows returned for trackId ${trackId}`);
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('❌ [upload-tracks] Transaction failed:', txErr);
      return createErrorResponse(
        500,
        txErr instanceof Error ? txErr.message : 'Failed to save tracks transactionally.'
      );
    } finally {
      client.release();
    }

    if (uploadedTracks.length === 0) {
      return createErrorResponse(
        500,
        'Failed to upload any tracks. Check server logs for details.'
      );
    }

    if (storagePathsToRemoveAfterCommit.length > 0) {
      void removeTrackStoragePaths(storagePathsToRemoveAfterCommit);
    }

    if (enqueueJobs.length > 0) {
      for (const job of enqueueJobs) {
        const enqueueResult = await enqueueTrackProcessing({
          userId,
          albumDbId: album.id,
          albumSlug: album.album_id,
          trackDbId: job.trackDbId,
          trackId: job.trackId,
          masterPath: job.masterPath,
        });

        if (!enqueueResult.ok) {
          console.error('[upload-tracks] Audio processing enqueue failed:', {
            trackId: job.trackId,
            trackDbId: job.trackDbId,
            reason: enqueueResult.reason,
            message: enqueueResult.message,
          });
          await markTrackProcessingEnqueueFailed(job.trackDbId, enqueueResult.message);

          const uploadedEntry = uploadedTracks.find((entry) => entry.trackId === job.trackId);
          if (uploadedEntry) {
            uploadedEntry.processingStatus = 'failed';
            uploadedEntry.processingError = enqueueResult.message;
          }
        }
      }
    }

    // createSuccessResponse уже кладёт payload в { success, data } — не дублировать вложенность.
    return createSuccessResponse(uploadedTracks, 200);
  } catch (error) {
    console.error('❌ Error in upload-tracks function:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};
