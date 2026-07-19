import {
  getAlbumDownloadFormatsLabel,
  getAlbumDownloadOfferLabel,
  getAudioFormatLabelFromSrc,
  getTrackDownloadFormatLabel,
} from '../getAlbumDownloadFormatsLabel';
import type { TrackDetails } from '@entities/album/model/albumDetails';

function track(partial: Partial<TrackDetails> & Pick<TrackDetails, 'src'>): TrackDetails {
  return {
    id: '1',
    title: 'Track',
    orderIndex: 0,
    duration: 180,
    playbackLocked: false,
    visibility: 'public',
    stemsAvailability: 'hidden',
    audioContainer: null,
    audioCodec: null,
    audioBitrate: null,
    audioSampleRate: null,
    audioBitDepth: null,
    audioChannels: null,
    audioDuration: null,
    audioFileSize: null,
    ...partial,
  };
}

function album(tracks: TrackDetails[]) {
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

describe('getTrackDownloadFormatLabel', () => {
  test('prefers stored technical metadata over filename', () => {
    expect(
      getTrackDownloadFormatLabel(
        track({
          src: 'fake.mp3',
          audioContainer: 'flac',
          audioBitDepth: 24,
          audioSampleRate: 96000,
        })
      )
    ).toBe('FLAC 24-bit · 96 kHz');
  });

  test('falls back to container from src without inventing bitrate', () => {
    expect(getTrackDownloadFormatLabel(track({ src: 'song.mp3' }))).toBe('MP3');
  });
});

describe('getAlbumDownloadFormatsLabel', () => {
  test('returns detailed labels from stored metadata', () => {
    expect(
      getAlbumDownloadFormatsLabel(
        album([
          track({
            id: '1',
            src: 'a.flac',
            audioContainer: 'flac',
            audioBitDepth: 24,
            audioSampleRate: 96000,
          }),
          track({
            id: '2',
            src: 'b.mp3',
            audioContainer: 'mp3',
            audioBitrate: 320_000,
          }),
        ])
      )
    ).toBe('FLAC 24-bit · 96 kHz · MP3 320 kbps');
  });

  test('returns a single format when all tracks share it', () => {
    expect(
      getAlbumDownloadFormatsLabel(
        album([track({ id: '1', src: 'a.mp3' }), track({ id: '2', src: 'b.mp3' })])
      )
    ).toBe('MP3');
  });

  test('lists unique formats with lossless first (legacy src)', () => {
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

describe('getAlbumDownloadOfferLabel', () => {
  test('appends real file size to format line', () => {
    expect(
      getAlbumDownloadOfferLabel(
        album([
          track({
            id: '1',
            src: 'a.flac',
            audioContainer: 'flac',
            audioBitDepth: 24,
            audioSampleRate: 96000,
            audioFileSize: 612 * 1024 * 1024,
          }),
        ])
      )
    ).toBe('FLAC 24-bit · 96 kHz · 612 MB');
  });

  test('formats large archives in GB', () => {
    expect(
      getAlbumDownloadOfferLabel(
        album([
          track({
            id: '1',
            src: 'a.wav',
            audioContainer: 'wav',
            audioBitDepth: 24,
            audioFileSize: Math.round(1.34 * 1024 * 1024 * 1024),
          }),
        ])
      )
    ).toBe('WAV 24-bit · 1.34 GB');
  });

  test('lossy offer line', () => {
    expect(
      getAlbumDownloadOfferLabel(
        album([
          track({
            id: '1',
            src: 'a.mp3',
            audioContainer: 'mp3',
            audioBitrate: 320_000,
            audioFileSize: 143 * 1024 * 1024,
          }),
        ])
      )
    ).toBe('MP3 320 kbps · 143 MB');
  });
});
