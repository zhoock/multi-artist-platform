/**
 * Merge per-locale album GET payloads into one track list (dashboard / owner GET /api/albums).
 * Lyrics follow ru-first canon; playback fields prefer the first locale row with a resolved src.
 */

import type { TrackLyricsBundle } from '../../../src/shared/lib/lyrics/types';
import { mergeTrackLyricsBundles } from './track-lyrics-merge';
import type { SupportedLang } from './types';

function isSupportedAlbumLang(lang: string | undefined): lang is SupportedLang {
  return lang === 'en' || lang === 'ru';
}

export interface TrackLocalePayload {
  title: string;
  authorship?: string;
}

export interface MergeTrackPayloadTrack {
  id: string;
  title: string;
  order_index: number;
  duration?: number;
  src?: string;
  content?: string;
  authorship?: string;
  lyrics: TrackLyricsBundle;
  translations?: Partial<Record<SupportedLang, TrackLocalePayload>>;
  visibility?: 'public' | 'subscribers_only' | 'hidden';
  stemsVisibility?: 'public' | 'subscribers_only' | 'hidden';
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

export interface MergeTrackAlbumPayload {
  lang?: string;
  tracks: MergeTrackPayloadTrack[];
}

export function hasValidPlaybackSrc(src: string | undefined | null): boolean {
  return Boolean(String(src ?? '').trim());
}

function localeRank(lang: string | undefined): number {
  if (lang === 'ru') return 0;
  if (lang === 'en') return 1;
  return 2;
}

function sortPayloadsByLocale(payloads: MergeTrackAlbumPayload[]): MergeTrackAlbumPayload[] {
  return [...payloads].sort((a, b) => localeRank(a.lang) - localeRank(b.lang));
}

export function collectLocaleTracksForId(
  sortedPayloads: MergeTrackAlbumPayload[],
  trackId: string
): MergeTrackPayloadTrack[] {
  const tid = String(trackId);
  const tracks: MergeTrackPayloadTrack[] = [];
  for (const payload of sortedPayloads) {
    const match = payload.tracks.find((t) => String(t.id) === tid);
    if (match) tracks.push(match);
  }
  return tracks;
}

/** First locale-ordered row with non-empty playback src, else locale-primary (first listed). */
export function selectPlaybackMetadataSource(
  sortedPayloads: MergeTrackAlbumPayload[],
  trackId: string
): MergeTrackPayloadTrack {
  const candidates = collectLocaleTracksForId(sortedPayloads, trackId);
  if (candidates.length === 0) {
    throw new Error(`selectPlaybackMetadataSource: missing track ${trackId}`);
  }
  for (const track of candidates) {
    if (hasValidPlaybackSrc(track.src)) {
      return track;
    }
  }
  return candidates[0]!;
}

export type TrackPlaybackMetadata = Pick<
  MergeTrackPayloadTrack,
  | 'src'
  | 'processingStatus'
  | 'processingError'
  | 'audioContainer'
  | 'audioCodec'
  | 'audioBitrate'
  | 'audioSampleRate'
  | 'audioBitDepth'
  | 'audioChannels'
  | 'audioDuration'
  | 'audioFileSize'
>;

export function extractPlaybackMetadata(track: MergeTrackPayloadTrack): TrackPlaybackMetadata {
  return {
    src: track.src,
    processingStatus: track.processingStatus,
    processingError: track.processingError,
    audioContainer: track.audioContainer,
    audioCodec: track.audioCodec,
    audioBitrate: track.audioBitrate,
    audioSampleRate: track.audioSampleRate,
    audioBitDepth: track.audioBitDepth,
    audioChannels: track.audioChannels,
    audioDuration: track.audioDuration,
    audioFileSize: track.audioFileSize,
  };
}

function pickFirstTrackWithId(
  sorted: MergeTrackAlbumPayload[],
  trackId: string
): MergeTrackPayloadTrack | undefined {
  const tid = String(trackId);
  for (const p of sorted) {
    const m = p.tracks.find((t) => String(t.id) === tid);
    if (m) return m;
  }
  return undefined;
}

/**
 * Текст и синхронизация — один канон (корень трека, приоритет ru-строки альбома).
 * Playback metadata — из первой locale-строки с resolved src (locale order), иначе ru-first row.
 */
export function mergeTrackPayloads(payloads: MergeTrackAlbumPayload[]): MergeTrackPayloadTrack[] {
  const sorted = sortPayloadsByLocale(payloads);

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
    const playbackSource = selectPlaybackMetadataSource(sorted, tid);
    const playbackFields = extractPlaybackMetadata(playbackSource);

    const translations: Partial<Record<SupportedLang, TrackLocalePayload>> = {};
    for (const p of sorted) {
      if (!p.lang || !isSupportedAlbumLang(p.lang)) continue;
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
      ...playbackFields,
      content: mergedLyrics.content,
      authorship: mergedLyrics.authorship ?? ct.authorship,
      lyrics: mergedLyrics,
      translations,
    };
  });
}
