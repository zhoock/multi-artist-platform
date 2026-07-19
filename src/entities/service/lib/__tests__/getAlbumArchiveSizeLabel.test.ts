import { formatArchiveSizeBytes, getAlbumArchiveSizeLabel } from '../getAlbumArchiveSizeLabel';
import type { IAlbums, TracksProps } from '@models';

function track(partial: Partial<TracksProps> & Pick<TracksProps, 'duration' | 'src'>): TracksProps {
  return {
    id: '1',
    title: 'Track',
    order_index: 0,
    content: '',
    ...partial,
  };
}

function album(tracks: TracksProps[]): Pick<IAlbums, 'tracks'> {
  return { tracks };
}

describe('formatArchiveSizeBytes', () => {
  test('formats megabytes as integer MB', () => {
    expect(formatArchiveSizeBytes(248 * 1024 * 1024)).toBe('248 MB');
  });

  test('formats gigabytes with two decimals when needed', () => {
    expect(formatArchiveSizeBytes(Math.round(1.34 * 1024 * 1024 * 1024))).toBe('1.34 GB');
  });

  test('formats smaller sizes as KB', () => {
    expect(formatArchiveSizeBytes(512 * 1024)).toBe('512 KB');
  });

  test('returns empty for non-positive values', () => {
    expect(formatArchiveSizeBytes(0)).toBe('');
    expect(formatArchiveSizeBytes(-1)).toBe('');
  });
});

describe('getAlbumArchiveSizeLabel', () => {
  test('estimates lossy size from duration', () => {
    // 10 min @ 320 kbps ≈ 23.4 MB → 23 MB
    expect(
      getAlbumArchiveSizeLabel(album([track({ duration: 600, src: 'song.mp3', id: 'a' })]))
    ).toBe('23 MB');
  });

  test('sums all tracks when every duration is known', () => {
    expect(
      getAlbumArchiveSizeLabel(
        album([
          track({ id: '1', duration: 180, src: 'a.mp3' }),
          track({ id: '2', duration: 180, src: 'b.mp3' }),
        ])
      )
    ).toBe('14 MB');
  });

  test('returns empty when any track duration is missing', () => {
    expect(
      getAlbumArchiveSizeLabel(
        album([
          track({ id: '1', duration: 180, src: 'a.mp3' }),
          track({ id: '2', duration: 0, src: 'b.mp3' }),
        ])
      )
    ).toBe('');
  });

  test('returns empty for album without tracks', () => {
    expect(getAlbumArchiveSizeLabel(album([]))).toBe('');
  });

  test('uses stored bitrate when available', () => {
    // 10 min @ 256 kbps ≈ 18.3 MiB → 18 MB
    expect(
      getAlbumArchiveSizeLabel(
        album([
          track({
            id: 'a',
            duration: 600,
            src: 'song.mp3',
            audioContainer: 'mp3',
            audioBitrate: 256_000,
          }),
        ])
      )
    ).toBe('18 MB');
  });

  test('prefers stored audioFileSize over estimates', () => {
    expect(
      getAlbumArchiveSizeLabel(
        album([
          track({
            id: 'a',
            duration: 600,
            src: 'song.flac',
            audioContainer: 'flac',
            audioFileSize: 612 * 1024 * 1024,
          }),
        ])
      )
    ).toBe('612 MB');
  });
});
