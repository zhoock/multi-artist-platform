import type { SyncedLyricsLine } from '@models';

import {
  applyImportedLyricsTimingsToEditor,
  buildLyricsTimingDownloadFilename,
  canExportSyncedLyricTimings,
  collectEditorLyricLineTexts,
  LYRICS_TIMING_FILE_FORMAT,
  LYRICS_TIMING_FILE_VERSION,
  LyricsTimingImportError,
  parseLyricsTimingFileJson,
  serializeLyricsTimingFile,
} from '../index';

const sampleLines: SyncedLyricsLine[] = [
  { text: 'Line one', startTime: 0.72, endTime: 6.04 },
  { text: 'Line two', startTime: 6.04, endTime: 11.61 },
];

describe('lyricsTimingFile export', () => {
  it('serializes public format without internal ids', () => {
    const file = serializeLyricsTimingFile('Helmsman is dead', sampleLines, '');
    expect(file.format).toBe(LYRICS_TIMING_FILE_FORMAT);
    expect(file.version).toBe(LYRICS_TIMING_FILE_VERSION);
    expect(file.track.title).toBe('Helmsman is dead');
    expect(file.lyrics).toEqual([
      { text: 'Line one', start: 0.72, end: 6.04 },
      { text: 'Line two', start: 6.04, end: 11.61 },
    ]);
    expect(Object.keys(file)).toEqual(['format', 'version', 'track', 'lyrics']);
    expect(Object.keys(file.track)).toEqual(['title']);
    expect(JSON.stringify(file)).not.toMatch(/uuid|albumId|trackId|userId/i);
  });

  it('builds safe filenames from track title', () => {
    expect(buildLyricsTimingDownloadFilename('Helmsman is dead')).toBe(
      'Helmsman-is-dead.timings.json'
    );
    expect(buildLyricsTimingDownloadFilename('???')).toBe('track.timings.json');
  });

  it('can export only when every lyric line has valid timings', () => {
    expect(canExportSyncedLyricTimings(sampleLines, '')).toBe(true);
    expect(canExportSyncedLyricTimings([{ text: 'A', startTime: 0, endTime: undefined }], '')).toBe(
      false
    );
  });
});

describe('lyricsTimingFile import', () => {
  const expected = collectEditorLyricLineTexts(sampleLines, '');

  const validJson = JSON.stringify(serializeLyricsTimingFile('Any', sampleLines, ''));

  it('parses valid files', () => {
    const imported = parseLyricsTimingFileJson(validJson, expected);
    expect(imported).toHaveLength(2);
    const next = applyImportedLyricsTimingsToEditor(
      sampleLines.map((l) => ({ ...l, startTime: 0, endTime: undefined })),
      '',
      imported
    );
    expect(next[0].startTime).toBe(0.72);
    expect(next[0].endTime).toBe(6.04);
  });

  it('rejects invalid json', () => {
    expect(() => parseLyricsTimingFileJson('{', expected)).toThrow(LyricsTimingImportError);
    try {
      parseLyricsTimingFileJson('{', expected);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('invalid-json');
    }
  });

  it('rejects unknown format and version', () => {
    const badFormat = JSON.stringify({
      format: 'other',
      version: 1,
      track: { title: 'x' },
      lyrics: [],
    });
    expect(() => parseLyricsTimingFileJson(badFormat, [])).toThrow(LyricsTimingImportError);
    try {
      parseLyricsTimingFileJson(badFormat, []);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('unsupported-format');
    }

    const badVersion = JSON.stringify({
      format: LYRICS_TIMING_FILE_FORMAT,
      version: 99,
      track: { title: 'x' },
      lyrics: [],
    });
    try {
      parseLyricsTimingFileJson(badVersion, []);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('unsupported-version');
    }
  });

  it('rejects structure, timings, counts and text order', () => {
    try {
      parseLyricsTimingFileJson(
        JSON.stringify({ format: LYRICS_TIMING_FILE_FORMAT, version: 1 }),
        expected
      );
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('invalid-structure');
    }

    const badTiming = JSON.stringify({
      format: LYRICS_TIMING_FILE_FORMAT,
      version: 1,
      track: { title: 'x' },
      lyrics: [{ text: 'Line one', start: -1, end: 2 }],
    });
    try {
      parseLyricsTimingFileJson(badTiming, ['Line one']);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('invalid-timings');
    }

    const badEnd = JSON.stringify({
      format: LYRICS_TIMING_FILE_FORMAT,
      version: 1,
      track: { title: 'x' },
      lyrics: [{ text: 'Line one', start: 1, end: 1 }],
    });
    try {
      parseLyricsTimingFileJson(badEnd, ['Line one']);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('invalid-timings');
    }

    try {
      parseLyricsTimingFileJson(validJson, ['Only one']);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('line-count-mismatch');
    }

    const swapped = JSON.stringify({
      format: LYRICS_TIMING_FILE_FORMAT,
      version: 1,
      track: { title: 'x' },
      lyrics: [
        { text: 'Line two', start: 1, end: 2 },
        { text: 'Line one', start: 2, end: 3 },
      ],
    });
    try {
      parseLyricsTimingFileJson(swapped, expected);
    } catch (e) {
      expect((e as LyricsTimingImportError).code).toBe('text-mismatch');
    }
  });
});
