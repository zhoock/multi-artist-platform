/**
 * Dashboard UI mappers: AlbumEditable → AlbumData / TrackData.
 */

import type { AlbumEditable } from '@models';
import { siteArtistUiLabel } from '@shared/lib/profileDisplayName';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { resolveLyricsSyncState } from '@shared/lib/lyrics';
import type { StemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

import { resolveAlbumEditableForDisplay } from './resolveAlbumEditableDisplay';

export interface AlbumData {
  id: string;
  albumId: string;
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
  order_index: number;
  duration: string;
  lyrics: TrackLyricsBundle;
  src?: string;
  authorship?: string;
  visibility?: TrackVisibility;
  stemsVisibility?: StemsVisibility;
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  processingError?: string | null;
}

function fallbackLyricsBundle(
  albumId: string,
  trackId: string,
  lang: SupportedLang | undefined,
  content?: string,
  authorship?: string
): TrackLyricsBundle {
  const canonicalLang = lang === 'ru' ? 'ru' : 'en';
  const text = content ?? '';
  const state = resolveLyricsSyncState({
    content: text,
    syncedLines: null,
  });
  return {
    albumId,
    trackId: String(trackId),
    lang: canonicalLang,
    content: text,
    authorship,
    syncedLines: null,
    state,
    syncedAt: null,
  };
}

function resolveTrackLyrics(
  albumId: string,
  track: AlbumEditable['tracks'][number],
  lang?: SupportedLang
): TrackLyricsBundle {
  if (track.lyrics) {
    return track.lyrics;
  }
  return fallbackLyricsBundle(albumId, track.id, lang, track.content, track.authorship);
}

export function transformEditableAlbumToAlbumData(
  album: AlbumEditable,
  siteDisplayName?: string,
  lang?: SupportedLang
): AlbumData {
  const source = lang ? resolveAlbumEditableForDisplay(album, lang) : album;
  const albumId = source.albumId || '';

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

  const tracks: TrackData[] = sourceTracks.map((track, displayIndex) => {
    let durationStr = '0:00';
    const trackDuration = track.duration;
    if (trackDuration != null) {
      if (typeof trackDuration === 'string') {
        if (/^\d+:\d{2}$/.test(trackDuration)) {
          durationStr = trackDuration;
        } else {
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
      lyrics: resolveTrackLyrics(albumId, track, lang),
      src: track.src,
      authorship: track.authorship || track.lyrics?.authorship || undefined,
      visibility: normalizeTrackVisibility((track as { visibility?: unknown }).visibility),
      stemsVisibility: normalizeStemsVisibility(
        (track as { stemsVisibility?: unknown }).stemsVisibility
      ),
      processingStatus: (track as { processingStatus?: TrackData['processingStatus'] })
        .processingStatus,
      processingError: (track as { processingError?: TrackData['processingError'] })
        .processingError,
    };
  });

  const artistLabel = siteArtistUiLabel(siteDisplayName ?? '');

  return {
    id: albumId,
    albumId: source.albumId || albumId,
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

export function transformEditableAlbumsToAlbumData(
  albums: AlbumEditable[],
  siteDisplayName?: string,
  lang?: SupportedLang
): AlbumData[] {
  return albums.map((a) => transformEditableAlbumToAlbumData(a, siteDisplayName, lang));
}
