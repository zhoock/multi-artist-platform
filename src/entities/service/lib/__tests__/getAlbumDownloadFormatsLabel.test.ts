import {
  getAlbumDownloadFormatsLabel,
  getAudioFormatLabelFromSrc,
} from '../getAlbumDownloadFormatsLabel';
import type { IAlbums, TracksProps } from '@models';

function track(partial: Partial<TracksProps> & Pick<TracksProps, 'src'>): TracksProps {
  return {
    id: '1',
    title: 'Track',
    order_index: 0,
    content: '',
    duration: 180,
    ...partial,
  };
}

function album(tracks: TracksProps[]): Pick<IAlbums, 'tracks'> {
  return { tracks };
}

describe('getAudioFormatLabelFromSrc', () => {
  test('maps common extensions', () => {
    expect(getAudioFormatLabelFromSrc('users/x/audio/album/song.mp3')).toBe('MP3');
    expect(getAudioFormatLabelFromSrc('track.WAV')).toBe('WAV');
    expect(getAudioFormatLabelFromSrc('master.flac')).toBe('FLAC');
    expect(getAudioFormatLabelFromSrc('stem.aiff')).toBe('AIFF');
  });

  test('returns null when extension is missing or unknown', () => {
    expect(getAudioFormatLabelFromSrc('')).toBeNull();
    expect(getAudioFormatLabelFromSrc('no-extension')).toBeNull();
    expect(getAudioFormatLabelFromSrc('file.xyz')).toBeNull();
  });
});

describe('getAlbumDownloadFormatsLabel', () => {
  test('returns a single format when all tracks share it', () => {
    expect(
      getAlbumDownloadFormatsLabel(
        album([track({ id: '1', src: 'a.mp3' }), track({ id: '2', src: 'b.mp3' })])
      )
    ).toBe('MP3');
  });

  test('lists unique formats with lossless first', () => {
    expect(
      getAlbumDownloadFormatsLabel(
        album([
          track({ id: '1', src: 'a.mp3' }),
          track({ id: '2', src: 'b.wav' }),
          track({ id: '3', src: 'c.flac' }),
        ])
      )
    ).toBe('WAV · FLAC · MP3');
  });

  test('returns empty when formats cannot be determined', () => {
    expect(getAlbumDownloadFormatsLabel(album([]))).toBe('');
    expect(getAlbumDownloadFormatsLabel(album([track({ id: '1', src: '' })]))).toBe('');
  });
});
