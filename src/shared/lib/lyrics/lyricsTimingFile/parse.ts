import type { LyricsTimingFileLine } from './types';
import { LYRICS_TIMING_FILE_FORMAT, LYRICS_TIMING_FILE_VERSION } from './constants';
import { LyricsTimingImportError } from './types';

const normalize = (text: string) => text.trim();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteTiming(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateTimingLine(line: unknown, index: number): LyricsTimingFileLine {
  if (!isPlainObject(line)) {
    throw new LyricsTimingImportError('invalid-structure');
  }
  const { text, start, end } = line;
  if (typeof text !== 'string') {
    throw new LyricsTimingImportError('invalid-structure');
  }
  if (!isFiniteTiming(start) || !isFiniteTiming(end)) {
    throw new LyricsTimingImportError('invalid-timings');
  }
  if (start < 0 || end <= start) {
    throw new LyricsTimingImportError('invalid-timings');
  }
  if (index < 0) {
    throw new LyricsTimingImportError('invalid-structure');
  }
  return { text, start, end };
}

function validateFileShape(data: unknown): LyricsTimingFileLine[] {
  if (!isPlainObject(data)) {
    throw new LyricsTimingImportError('invalid-structure');
  }

  if (data.format !== LYRICS_TIMING_FILE_FORMAT) {
    throw new LyricsTimingImportError('unsupported-format');
  }

  if (data.version !== LYRICS_TIMING_FILE_VERSION) {
    throw new LyricsTimingImportError('unsupported-version');
  }

  if (!isPlainObject(data.track) || typeof data.track.title !== 'string') {
    throw new LyricsTimingImportError('invalid-structure');
  }

  if (!Array.isArray(data.lyrics)) {
    throw new LyricsTimingImportError('invalid-structure');
  }

  return data.lyrics.map((line, index) => validateTimingLine(line, index));
}

export function parseLyricsTimingFileJson(
  raw: string,
  expectedLineTexts: string[]
): LyricsTimingFileLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new LyricsTimingImportError('invalid-json');
  }

  const lyrics = validateFileShape(parsed);

  if (lyrics.length !== expectedLineTexts.length) {
    throw new LyricsTimingImportError('line-count-mismatch');
  }

  for (let i = 0; i < lyrics.length; i++) {
    if (normalize(lyrics[i].text) !== normalize(expectedLineTexts[i])) {
      throw new LyricsTimingImportError('text-mismatch');
    }
  }

  return lyrics;
}
