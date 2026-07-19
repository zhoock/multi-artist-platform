import type { TrackDetails } from '@entities/album/model/albumDetails';
import {
  formatAlbumAudioTechnicalLabels,
  formatAudioTechnicalLabel,
  getAudioContainerDisplayLabel,
  pickAudioTechnicalMetadata,
  type AudioTechnicalMetadata,
} from '@shared/lib/audio/audioTechnicalMetadata';
import { getAlbumArchiveSizeLabel } from './getAlbumArchiveSizeLabel';

type TrackFormatSource = Pick<
  TrackDetails,
  | 'src'
  | 'audioContainer'
  | 'audioCodec'
  | 'audioBitrate'
  | 'audioSampleRate'
  | 'audioBitDepth'
  | 'audioChannels'
>;

/** Legacy fallback: только контейнер по расширению `src` (без bitrate / bit depth / sample rate). */
const CONTAINER_BY_EXT: Record<string, string> = {
  mp3: 'mp3',
  wav: 'wav',
  flac: 'flac',
  aiff: 'aiff',
  aif: 'aiff',
  m4a: 'aac',
  aac: 'aac',
  ogg: 'ogg',
  opus: 'opus',
  wma: 'wma',
};

function containerFromSrc(src: string | null | undefined): string | null {
  const fileName = (src || '').trim().split(/[\\/]/).pop() || '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) {
    return null;
  }
  const ext = fileName.slice(dot + 1).toLowerCase();
  return CONTAINER_BY_EXT[ext] ?? null;
}

function resolveTrackFormatMeta(track: TrackFormatSource): AudioTechnicalMetadata {
  const stored = pickAudioTechnicalMetadata(track);
  if (stored.audioContainer) {
    return stored;
  }
  return {
    ...stored,
    audioContainer: containerFromSrc(track.src),
  };
}

/**
 * Подпись формата одной дорожки: сохранённые tech-поля при загрузке.
 * Если их ещё нет (старые треки) — только контейнер по расширению `src`, без выдуманных чисел.
 */
export function getTrackDownloadFormatLabel(track: TrackFormatSource): string {
  return formatAudioTechnicalLabel(resolveTrackFormatMeta(track));
}

/** Legacy helper: контейнер по расширению `src` → display label (MP3, FLAC, …). */
export function getAudioFormatLabelFromSrc(src: string | null | undefined): string | null {
  return getAudioContainerDisplayLabel(containerFromSrc(src));
}

/**
 * Unique format labels from stored track tech metadata (without size).
 * Example: `MP3 320 kbps`, `FLAC 24-bit · 96 kHz · WAV 24-bit · 48 kHz`.
 */
export function getAlbumDownloadFormatsLabel(album: {
  tracks?: readonly TrackFormatSource[];
}): string {
  return formatAlbumAudioTechnicalLabels(
    (album.tracks ?? []).map((t) => resolveTrackFormatMeta(t))
  );
}

/**
 * Offer line for the purchase / download card: formats + total size.
 * Examples: `FLAC 24-bit · 96 kHz · 612 MB`, `MP3 320 kbps · 143 MB`.
 */
export function getAlbumDownloadOfferLabel(album: { tracks?: readonly TrackDetails[] }): string {
  const formats = getAlbumDownloadFormatsLabel(album);
  const size = getAlbumArchiveSizeLabel(album);
  if (formats && size) {
    return `${formats} · ${size}`;
  }
  return formats || size;
}
