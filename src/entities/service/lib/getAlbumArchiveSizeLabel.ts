import type { TrackDetails } from '@entities/album/model/albumDetails';
import { pickAudioTechnicalMetadata } from '@shared/lib/audio/audioTechnicalMetadata';

type TrackSizeSource = Pick<
  TrackDetails,
  | 'duration'
  | 'src'
  | 'audioContainer'
  | 'audioBitrate'
  | 'audioSampleRate'
  | 'audioBitDepth'
  | 'audioChannels'
  | 'audioDuration'
  | 'audioFileSize'
>;

/** Typical FLAC ratio vs CD WAV for music when bitrate unknown. */
const FLAC_SIZE_RATIO = 0.55;
/** Fallback lossy bitrate when real bitrate is unknown. */
const DEFAULT_LOSSY_BITRATE_BPS = 320_000;

/**
 * Human-readable archive / file size.
 * Examples: `612 MB`, `1.34 GB`, `512 KB`.
 */
export function formatArchiveSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }

  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const rounded = Math.round(gb * 100) / 100;
    return `${rounded} GB`;
  }

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }

  const kb = bytes / 1024;
  if (kb >= 1) {
    return `${Math.round(kb)} KB`;
  }

  return `${Math.round(bytes)} B`;
}

function containerFromSrc(src: string | null | undefined): string | null {
  const fileName = (src || '').trim().split(/[\\/]/).pop() || '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) {
    return null;
  }
  const ext = fileName.slice(dot + 1).toLowerCase();
  if (ext === 'aif') return 'aiff';
  if (ext === 'm4a') return 'aac';
  return ext || null;
}

function estimateTrackBytes(track: TrackSizeSource): number | null {
  const meta = pickAudioTechnicalMetadata(track);
  if (meta.audioFileSize != null && meta.audioFileSize > 0) {
    return meta.audioFileSize;
  }

  const duration =
    meta.audioDuration ??
    (Number.isFinite(Number(track.duration)) && Number(track.duration) > 0
      ? Number(track.duration)
      : null);
  if (duration == null) {
    return null;
  }

  const container = meta.audioContainer || containerFromSrc(track.src);

  if (meta.audioBitrate != null && meta.audioBitrate > 0) {
    return Math.round((duration * meta.audioBitrate) / 8);
  }

  const isPcmFamily = container === 'wav' || container === 'aiff' || container === 'aif';
  const isFlac = container === 'flac' || container === 'alac';

  if (isPcmFamily || isFlac) {
    const sampleRate =
      meta.audioSampleRate && meta.audioSampleRate > 0 ? meta.audioSampleRate : 44100;
    const bitDepth = meta.audioBitDepth && meta.audioBitDepth > 0 ? meta.audioBitDepth : 16;
    const channels = meta.audioChannels && meta.audioChannels > 0 ? meta.audioChannels : 2;
    const pcmBytesPerSecond = (sampleRate * bitDepth * channels) / 8;
    const bytes = Math.round(duration * pcmBytesPerSecond);
    return isFlac ? Math.round(bytes * FLAC_SIZE_RATIO) : bytes;
  }

  // Lossy / unknown without stored bitrate — same heuristic as before (320 kbps)
  return Math.round((duration * DEFAULT_LOSSY_BITRATE_BPS) / 8);
}

/**
 * Total download size for the album: sum of stored `audioFileSize` when present,
 * otherwise estimate from duration + tech specs. Empty when unknown.
 */
export function getAlbumArchiveSizeBytes(album: {
  tracks?: readonly TrackSizeSource[];
}): number | null {
  const tracks = album.tracks ?? [];
  if (tracks.length === 0) {
    return null;
  }

  let totalBytes = 0;
  for (const track of tracks) {
    const bytes = estimateTrackBytes(track);
    if (bytes == null) {
      return null;
    }
    totalBytes += bytes;
  }

  return totalBytes;
}

/**
 * Right-side / offer size label. Empty when size is unknown — never a status word.
 */
export function getAlbumArchiveSizeLabel(album: { tracks?: readonly TrackSizeSource[] }): string {
  const totalBytes = getAlbumArchiveSizeBytes(album);
  if (totalBytes == null) {
    return '';
  }
  return formatArchiveSizeBytes(totalBytes);
}
