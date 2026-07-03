// src/entities/album/lib/transformAlbumData.ts
/**
 * Утилиты для трансформации данных альбомов из IAlbums в формат для UI
 */

import type { IAlbums } from '@models';
import { siteArtistUiLabel } from '@shared/lib/profileDisplayName';
import type { SupportedLang } from '@shared/model/lang';
import type { StemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

import { resolveAlbumForDisplay } from './resolveAlbumDisplay';

export interface AlbumData {
  id: string;
  albumId: string; // Строковый ID альбома (например, "23-remastered")
  /** Владелец альбома в storage (users/{id}/...); нужен для явных URL медиа */
  userId?: string;
  title: string;
  artist: string;
  year: string;
  cover?: string;
  releaseDate?: string;
  isPublic?: boolean;
  isPublished?: boolean;
  tracks: TrackData[];
}

export interface TrackData {
  id: string;
  title: string;
  /** Порядок в альбоме из БД; отображение списка сортируется по этому полю. */
  order_index: number;
  duration: string;
  lyricsStatus: 'synced' | 'text-only' | 'empty';
  lyricsText?: string;
  src?: string;
  authorship?: string;
  syncedLyrics?: { text: string; startTime: number; endTime?: number }[];
  visibility?: TrackVisibility;
  stemsVisibility?: StemsVisibility;
}

/**
 * Преобразует альбом из формата IAlbums в формат AlbumData для UI
 * @param siteDisplayName Имя из профиля (site_name); поле album.artist в UI не используется
 */
export function transformAlbumToAlbumData(
  album: IAlbums,
  siteDisplayName?: string,
  lang?: SupportedLang
): AlbumData {
  const source = lang ? resolveAlbumForDisplay(album, lang) : album;
  const albumId = source.albumId || '';

  // Обрабатываем release (объект с полем date)
  let releaseDate: Date | null = null;
  if (source.release && typeof source.release === 'object' && 'date' in source.release) {
    const raw = source.release.date;
    const dateStr = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
    if (dateStr) {
      releaseDate = new Date(dateStr);
    }
  }

  const sourceTracks = [...(source.tracks || [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  );

  // Создаем треки с определением статуса на основе данных из альбома
  const tracks: TrackData[] = sourceTracks.map((track, displayIndex) => {
    // Определяем статус на основе данных из альбома
    let lyricsStatus: TrackData['lyricsStatus'] = 'empty';
    if (track.syncedLyrics && track.syncedLyrics.length > 0) {
      // Проверяем, действительно ли синхронизировано (есть startTime > 0)
      const isActuallySynced = track.syncedLyrics.some((line) => line.startTime > 0);
      lyricsStatus = isActuallySynced ? 'synced' : 'text-only';
    } else if (track.content && track.content.trim() !== '') {
      lyricsStatus = 'text-only';
    }

    // Форматируем duration: если это число (секунды), преобразуем в MM:SS
    let durationStr = '0:00';
    const trackDuration = track.duration;
    if (trackDuration != null) {
      if (typeof trackDuration === 'string') {
        // Если уже строка, проверяем формат
        // Если это формат MM:SS, оставляем как есть
        if (/^\d+:\d{2}$/.test(trackDuration)) {
          durationStr = trackDuration;
        } else {
          // Если это число в виде строки, пытаемся преобразовать
          const numDuration = parseFloat(trackDuration);
          if (!isNaN(numDuration)) {
            const mins = Math.floor(numDuration / 60);
            const secs = Math.floor(numDuration % 60);
            durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
          } else {
            durationStr = trackDuration;
          }
        }
      } else if (typeof trackDuration === 'number') {
        // duration хранится в секундах в БД
        const mins = Math.floor(trackDuration / 60);
        const secs = Math.floor(trackDuration % 60);
        durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    }

    const orderRaw = track.order_index;
    const order_index =
      typeof orderRaw === 'number' && !Number.isNaN(orderRaw) ? orderRaw : displayIndex;

    return {
      id: String(track.id),
      title: track.title,
      order_index,
      duration: durationStr,
      lyricsStatus,
      lyricsText: track.content, // Используем текст из альбома, если есть
      src: track.src,
      authorship: (track as any).authorship || undefined,
      syncedLyrics: track.syncedLyrics || undefined, // Добавляем syncedLyrics из альбома
      visibility: normalizeTrackVisibility((track as { visibility?: unknown }).visibility),
      stemsVisibility: normalizeStemsVisibility(
        (track as { stemsVisibility?: unknown }).stemsVisibility
      ),
    };
  });

  const artistLabel = siteArtistUiLabel(siteDisplayName ?? '');

  return {
    id: albumId,
    albumId: source.albumId || albumId, // Сохраняем строковый ID альбома
    userId: source.userId,
    title: source.album,
    artist: artistLabel,
    year: releaseDate ? releaseDate.getFullYear().toString() : '',
    cover: source.cover,
    isPublic: source.isPublic,
    isPublished: source.isPublished,
    releaseDate: releaseDate
      ? releaseDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : undefined,
    tracks,
  };
}

/**
 * Преобразует массив альбомов из формата IAlbums[] в формат AlbumData[]
 */
export function transformAlbumsToAlbumData(
  albums: IAlbums[],
  siteDisplayName?: string,
  lang?: SupportedLang
): AlbumData[] {
  return albums.map((a) => transformAlbumToAlbumData(a, siteDisplayName, lang));
}
