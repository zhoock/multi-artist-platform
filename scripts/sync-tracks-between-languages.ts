/**
 * Скрипт для синхронизации треков между языковыми версиями одного альбома
 * Обеспечивает, что все языковые версии альбома имеют одинаковый набор треков
 *
 * Использование:
 *   npx tsx scripts/sync-tracks-between-languages.ts
 */

import { query, closePool } from '../netlify/functions/lib/db';
import * as fs from 'fs';
import * as path from 'path';

// Загружаем переменные окружения из .env файла
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

interface AlbumRow {
  id: string;
  album_id: string;
  lang: string;
  user_id: string;
}

interface TrackRow {
  track_id: string;
  title: string;
  duration: number | null;
  src: string;
  content: string | null;
  authorship: string | null;
  order_index: number;
  audio_container?: string | null;
  audio_codec?: string | null;
  audio_bitrate?: number | null;
  audio_sample_rate?: number | null;
  audio_bit_depth?: number | null;
  audio_channels?: number | null;
  audio_duration?: number | null;
  audio_file_size?: number | null;
}

async function syncTracksBetweenLanguages() {
  console.log('🔄 Синхронизируем треки между языковыми версиями альбомов...\n');

  try {
    const targetEmail = process.env.SCRIPT_TARGET_EMAIL?.trim();
    if (!targetEmail) {
      console.error('❌ Задайте SCRIPT_TARGET_EMAIL (пользователь в БД).');
      return;
    }

    const userResult = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
      targetEmail,
    ]);

    if (userResult.rows.length === 0) {
      console.error('❌ Пользователь не найден', { email: targetEmail });
      return;
    }

    const userId = userResult.rows[0].id;

    // Получаем все альбомы, сгруппированные по album_id
    const albumsResult = await query<AlbumRow>(
      `SELECT id, album_id, lang, user_id
       FROM albums
       WHERE user_id = $1
       ORDER BY album_id, lang`,
      [userId]
    );

    // Группируем альбомы по album_id
    const albumsByAlbumId = new Map<string, AlbumRow[]>();
    for (const album of albumsResult.rows) {
      if (!albumsByAlbumId.has(album.album_id)) {
        albumsByAlbumId.set(album.album_id, []);
      }
      albumsByAlbumId.get(album.album_id)!.push(album);
    }

    console.log(`📦 Найдено ${albumsByAlbumId.size} уникальных альбомов\n`);

    let totalSynced = 0;
    let totalAlbumsProcessed = 0;

    // Обрабатываем каждый альбом
    for (const [albumId, albums] of albumsByAlbumId.entries()) {
      if (albums.length < 2) {
        // Если только одна языковая версия, пропускаем
        continue;
      }

      totalAlbumsProcessed++;
      console.log(`🎵 Обрабатываем альбом: ${albumId}`);
      console.log(`   Языковые версии: ${albums.map((a) => a.lang).join(', ')}\n`);

      // Получаем все треки для всех языковых версий
      const tracksByLang = new Map<string, Map<string, TrackRow>>();

      for (const album of albums) {
        const tracksResult = await query<TrackRow>(
          `SELECT track_id, title, duration, src, content, authorship, order_index,
                  audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels,
                  audio_duration, audio_file_size
           FROM tracks
           WHERE album_id = $1
           ORDER BY order_index ASC`,
          [album.id]
        );

        const tracksMap = new Map<string, TrackRow>();
        for (const track of tracksResult.rows) {
          tracksMap.set(track.track_id, track);
        }
        tracksByLang.set(album.lang, tracksMap);

        console.log(`   ${album.lang}: ${tracksResult.rows.length} треков`);
      }

      // Находим эталонную версию (с наибольшим количеством треков)
      let referenceLang = '';
      let maxTracks = 0;
      const allTrackIds = new Set<string>();

      for (const [lang, tracks] of tracksByLang.entries()) {
        if (tracks.size > maxTracks) {
          maxTracks = tracks.size;
          referenceLang = lang;
        }
        for (const trackId of tracks.keys()) {
          allTrackIds.add(trackId);
        }
      }

      console.log(`   Эталонная версия: ${referenceLang} (${maxTracks} треков)`);
      console.log(`   Всего уникальных треков: ${allTrackIds.size}\n`);

      const referenceTracks = tracksByLang.get(referenceLang)!;

      // Синхронизируем треки для каждой языковой версии
      for (const album of albums) {
        if (album.lang === referenceLang) {
          continue; // Пропускаем эталонную версию
        }

        const currentTracks = tracksByLang.get(album.lang)!;
        const missingTrackIds: string[] = [];
        const extraTrackIds: string[] = [];

        // Находим недостающие треки
        for (const trackId of referenceTracks.keys()) {
          if (!currentTracks.has(trackId)) {
            missingTrackIds.push(trackId);
          }
        }

        // Находим лишние треки (которые есть в текущей версии, но нет в эталонной)
        for (const trackId of currentTracks.keys()) {
          if (!referenceTracks.has(trackId)) {
            extraTrackIds.push(trackId);
          }
        }

        if (missingTrackIds.length === 0 && extraTrackIds.length === 0) {
          console.log(`   ✅ ${album.lang}: синхронизировано`);
          continue;
        }

        console.log(`   🔄 ${album.lang}:`);
        if (missingTrackIds.length > 0) {
          console.log(`      Недостающие треки: ${missingTrackIds.join(', ')}`);
        }
        if (extraTrackIds.length > 0) {
          console.log(`      Лишние треки: ${extraTrackIds.join(', ')}`);
        }

        // Добавляем недостающие треки (копируем из эталонной версии)
        for (const trackId of missingTrackIds) {
          const referenceTrack = referenceTracks.get(trackId)!;
          await query(
            `INSERT INTO tracks (
               album_id, track_id, title, duration, src, content, authorship, order_index,
               audio_container, audio_codec, audio_bitrate, audio_sample_rate, audio_bit_depth, audio_channels,
               audio_duration, audio_file_size,
               created_at, updated_at
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             )`,
            [
              album.id,
              referenceTrack.track_id,
              referenceTrack.title, // Можно оставить название из эталонной версии или перевести
              referenceTrack.duration,
              referenceTrack.src,
              referenceTrack.content, // Можно оставить текст из эталонной версии или перевести
              referenceTrack.authorship,
              referenceTrack.order_index,
              referenceTrack.audio_container ?? null,
              referenceTrack.audio_codec ?? null,
              referenceTrack.audio_bitrate ?? null,
              referenceTrack.audio_sample_rate ?? null,
              referenceTrack.audio_bit_depth ?? null,
              referenceTrack.audio_channels ?? null,
              referenceTrack.audio_duration ?? null,
              referenceTrack.audio_file_size ?? null,
            ]
          );
          console.log(`      ✅ Добавлен трек [${trackId}] ${referenceTrack.title}`);
          totalSynced++;
        }

        // Удаляем лишние треки (которые есть только в этой версии)
        if (extraTrackIds.length > 0) {
          for (const trackId of extraTrackIds) {
            await query(`DELETE FROM tracks WHERE album_id = $1 AND track_id = $2`, [
              album.id,
              trackId,
            ]);
            console.log(`      🗑️  Удалён трек [${trackId}]`);
          }
        }

        console.log('');
      }

      console.log('');
    }

    console.log('✨ Синхронизация завершена!');
    console.log(`📊 Обработано альбомов: ${totalAlbumsProcessed}`);
    console.log(`✅ Добавлено треков: ${totalSynced}`);
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Запускаем синхронизацию
if (require.main === module) {
  syncTracksBetweenLanguages()
    .then(() => {
      console.log('✅ Скрипт завершён успешно');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Скрипт завершён с ошибкой:', error);
      process.exit(1);
    });
}

export { syncTracksBetweenLanguages };
