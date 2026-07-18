import type { IAlbums, TracksProps } from '@models';

/** 44.1 kHz · 16-bit · stereo PCM (WAV/AIFF). */
const WAV_BYTES_PER_SECOND = 44100 * 2 * 2;
/** Typical FLAC ratio vs CD WAV for music. */
const FLAC_SIZE_RATIO = 0.55;
/** Fallback lossy bitrate when format is unknown (mp3/aac/…). */
const LOSSY_BITRATE_BPS = 320_000;

export function formatArchiveSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
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

function estimateTrackBytes(track: Pick<TracksProps, 'duration' | 'src'>): number | null {
  const duration = Number(track.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const src = (track.src || '').toLowerCase();
  if (src.endsWith('.wav') || src.endsWith('.aiff') || src.endsWith('.aif')) {
    return Math.round(duration * WAV_BYTES_PER_SECOND);
  }
  if (src.endsWith('.flac')) {
    return Math.round(duration * WAV_BYTES_PER_SECOND * FLAC_SIZE_RATIO);
  }

  return Math.round((duration * LOSSY_BITRATE_BPS) / 8);
}

/**
 * Right-side label for the download card: archive size when estimable from track
 * durations (+ format from `src`). Empty when size is unknown — never a status word.
 */
export function getAlbumArchiveSizeLabel(album: Pick<IAlbums, 'tracks'>): string {
  const tracks = album.tracks ?? [];
  if (tracks.length === 0) {
    return '';
  }

  let totalBytes = 0;
  for (const track of tracks) {
    const bytes = estimateTrackBytes(track);
    if (bytes == null) {
      return '';
    }
    totalBytes += bytes;
  }

  return formatArchiveSizeBytes(totalBytes);
}
