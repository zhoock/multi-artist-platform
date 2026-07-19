import {
  buildAudioTechnicalMetadata,
  formatAlbumAudioTechnicalLabels,
  formatAudioTechnicalLabel,
  formatBitrateLabel,
  formatSampleRateLabel,
  normalizeAudioContainer,
} from '../audioTechnicalMetadata';

describe('normalizeAudioContainer', () => {
  test('maps common probe containers/codecs', () => {
    expect(normalizeAudioContainer('MPEG', 'MPEG 1 Layer 3')).toBe('mp3');
    expect(normalizeAudioContainer('FLAC', 'FLAC')).toBe('flac');
    expect(normalizeAudioContainer('WAVE', 'PCM')).toBe('wav');
    expect(normalizeAudioContainer('AIFF', 'PCM')).toBe('aiff');
    expect(normalizeAudioContainer('MP4', 'MPEG-4/AAC')).toBe('aac');
    expect(normalizeAudioContainer('M4A/AAC', 'AAC')).toBe('aac');
    expect(normalizeAudioContainer('MP4', 'ALAC')).toBe('alac');
    expect(normalizeAudioContainer('Ogg', 'Vorbis')).toBe('ogg');
    expect(normalizeAudioContainer('Ogg', 'Opus')).toBe('opus');
  });

  test('does not invent a container from empty probe', () => {
    expect(normalizeAudioContainer(null, null)).toBeNull();
    expect(normalizeAudioContainer('', '')).toBeNull();
  });
});

describe('buildAudioTechnicalMetadata', () => {
  test('keeps bit depth null for MP3 even if bitsPerSample sneaks in', () => {
    const meta = buildAudioTechnicalMetadata({
      container: 'MPEG',
      codec: 'MPEG 1 Layer 3',
      bitrate: 320_000,
      sampleRate: 44100,
      bitsPerSample: 16,
      numberOfChannels: 2,
      duration: 180.456,
      fileSize: 7_200_000,
    });
    expect(meta).toEqual({
      audioContainer: 'mp3',
      audioCodec: 'MPEG 1 Layer 3',
      audioBitrate: 320_000,
      audioSampleRate: 44100,
      audioBitDepth: null,
      audioChannels: 2,
      audioDuration: 180.46,
      audioFileSize: 7_200_000,
    });
  });

  test('keeps FLAC bit depth and sample rate', () => {
    const meta = buildAudioTechnicalMetadata({
      container: 'FLAC',
      codec: 'FLAC',
      sampleRate: 96000,
      bitsPerSample: 24,
      numberOfChannels: 2,
    });
    expect(meta.audioContainer).toBe('flac');
    expect(meta.audioBitDepth).toBe(24);
    expect(meta.audioSampleRate).toBe(96000);
    expect(meta.audioBitrate).toBeNull();
  });
});

describe('formatSampleRateLabel / formatBitrateLabel', () => {
  test('formats common sample rates', () => {
    expect(formatSampleRateLabel(44100)).toBe('44.1 kHz');
    expect(formatSampleRateLabel(48000)).toBe('48 kHz');
    expect(formatSampleRateLabel(96000)).toBe('96 kHz');
  });

  test('formats bitrate in kbps', () => {
    expect(formatBitrateLabel(320_000)).toBe('320 kbps');
    expect(formatBitrateLabel(256_000)).toBe('256 kbps');
  });
});

describe('formatAudioTechnicalLabel', () => {
  test('lossless with full detail uses middot before sample rate', () => {
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'flac',
        audioBitDepth: 24,
        audioSampleRate: 96000,
      })
    ).toBe('FLAC 24-bit · 96 kHz');
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'flac',
        audioBitDepth: 16,
        audioSampleRate: 44100,
      })
    ).toBe('FLAC 16-bit · 44.1 kHz');
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'wav',
        audioBitDepth: 24,
        audioSampleRate: 48000,
      })
    ).toBe('WAV 24-bit · 48 kHz');
  });

  test('lossy with bitrate', () => {
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'mp3',
        audioBitrate: 320_000,
      })
    ).toBe('MP3 320 kbps');
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'aac',
        audioBitrate: 256_000,
      })
    ).toBe('AAC 256 kbps');
  });

  test('falls back to container only when detail is missing — never invents numbers', () => {
    expect(formatAudioTechnicalLabel({ audioContainer: 'flac' })).toBe('FLAC');
    expect(formatAudioTechnicalLabel({ audioContainer: 'wav' })).toBe('WAV');
    expect(formatAudioTechnicalLabel({ audioContainer: 'mp3' })).toBe('MP3');
    expect(
      formatAudioTechnicalLabel({
        audioContainer: 'flac',
        audioBitDepth: 24,
      })
    ).toBe('FLAC 24-bit');
  });

  test('returns empty without container', () => {
    expect(formatAudioTechnicalLabel({})).toBe('');
    expect(formatAudioTechnicalLabel(null)).toBe('');
  });
});

describe('formatAlbumAudioTechnicalLabels', () => {
  test('lists unique labels lossless-first', () => {
    expect(
      formatAlbumAudioTechnicalLabels([
        { audioContainer: 'mp3', audioBitrate: 320_000 },
        { audioContainer: 'flac', audioBitDepth: 24, audioSampleRate: 96000 },
        { audioContainer: 'mp3', audioBitrate: 320_000 },
      ])
    ).toBe('FLAC 24-bit · 96 kHz · MP3 320 kbps');
  });

  test('returns empty when no metadata', () => {
    expect(formatAlbumAudioTechnicalLabels([])).toBe('');
    expect(formatAlbumAudioTechnicalLabels([{}, null])).toBe('');
  });
});
