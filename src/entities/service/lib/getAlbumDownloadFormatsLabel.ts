import type { IAlbums } from '@models';

/** Display label for a downloadable audio container (from file extension). */
const FORMAT_LABEL_BY_EXT: Record<string, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  flac: 'FLAC',
  aiff: 'AIFF',
  aif: 'AIFF',
  m4a: 'AAC',
  aac: 'AAC',
  ogg: 'OGG',
  opus: 'Opus',
  wma: 'WMA',
};

/** Prefer lossless / higher-fidelity first when several formats appear. */
const FORMAT_SORT_ORDER = ['WAV', 'AIFF', 'FLAC', 'ALAC', 'AAC', 'MP3', 'OGG', 'Opus', 'WMA'];

export function getAudioFormatLabelFromSrc(src: string | null | undefined): string | null {
  const fileName = (src || '').trim().split(/[\\/]/).pop() || '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) {
    return null;
  }

  const ext = fileName.slice(dot + 1).toLowerCase();
  return FORMAT_LABEL_BY_EXT[ext] ?? null;
}

/**
 * Subtitle for the Buy Album card: unique formats present in the album track files.
 * Example: `MP3`, `WAV · FLAC`. Empty when formats cannot be determined.
 */
export function getAlbumDownloadFormatsLabel(album: Pick<IAlbums, 'tracks'>): string {
  const seen = new Set<string>();
  for (const track of album.tracks ?? []) {
    const label = getAudioFormatLabelFromSrc(track.src);
    if (label) {
      seen.add(label);
    }
  }

  if (seen.size === 0) {
    return '';
  }

  return [...seen]
    .sort((a, b) => {
      const ai = FORMAT_SORT_ORDER.indexOf(a);
      const bi = FORMAT_SORT_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
    })
    .join(' · ');
}
