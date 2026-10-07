import { mergePlaybackMetaForLyricsUpsert, saveTrackLyricsContent } from '../track-lyrics';
import { isPublicPlayableTrack } from '../../../../src/shared/lib/tracks/publicTrackPresentation';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../track-pipeline-schema', () => ({
  tracksTableHasPipelineColumns: jest.fn().mockResolvedValue(true),
}));

import { query } from '../db';

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('track lyrics save preserves playback metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('mergePlaybackMetaForLyricsUpsert copies ready + visibility from locale mirror', () => {
    const merged = mergePlaybackMetaForLyricsUpsert(undefined, {
      processing_status: 'ready',
      visibility: 'public',
      stems_visibility: 'public',
      master_path: 'users/u1/audio/x/original/master.wav',
    });

    expect(merged.processing_status).toBe('ready');
    expect(merged.visibility).toBe('public');
    expect(merged.stems_visibility).toBe('public');
    expect(merged.master_path).toContain('master.wav');
  });

  test('ready locale track stays public-playable after meta merge', () => {
    const { processing_status, visibility } = mergePlaybackMetaForLyricsUpsert(undefined, {
      processing_status: 'ready',
      visibility: 'public',
    });
    expect(isPublicPlayableTrack(visibility, processing_status)).toBe(true);
  });

  test('saveTrackLyricsContent INSERT on canonical copies ready from en-only row', async () => {
    const insertParams: unknown[][] = [];
    const readyLocaleTrack = {
      title: 'Norwegian Wood',
      duration: 120,
      src: 'https://example.com/user-media/users/u1/audio/rubber-soul/derived/stream/opus_128k/t.opus',
      order_index: 2,
      authorship: null,
      processing_status: 'ready',
      processing_error: null,
      master_path: 'users/u1/audio/rubber-soul/original/x.wav',
      visibility: 'public',
      stems_visibility: 'public',
    };

    mockedQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.includes('FROM albums') && normalized.includes('user_id = $2')) {
        return {
          rows: [
            { id: 'album-ru-pk', lang: 'ru', user_id: 'user-1' },
            { id: 'album-en-pk', lang: 'en', user_id: 'user-1' },
          ],
        } as never;
      }

      if (normalized.includes('SELECT content, authorship FROM tracks')) {
        return {
          rows: [{ content: 'Saved lyrics', authorship: null }],
        } as never;
      }

      if (normalized.includes('FROM tracks') && params?.[0] === 'album-ru-pk') {
        if (normalized.includes('processing_status')) {
          return {
            rows: [{ ...readyLocaleTrack, content: 'Saved lyrics' }],
          } as never;
        }
        return { rows: [] } as never;
      }

      if (normalized.includes('FROM tracks') && params?.[0] === 'album-en-pk') {
        return { rows: [readyLocaleTrack] } as never;
      }

      if (normalized.startsWith('INSERT INTO tracks')) {
        insertParams.push(params ?? []);
        return { rows: [] } as never;
      }

      if (normalized.includes('FROM synced_lyrics')) {
        return { rows: [] } as never;
      }

      if (normalized.includes('SELECT id, user_id, lang FROM albums')) {
        return { rows: [{ id: 'album-ru-pk', user_id: 'user-1', lang: 'ru' }] } as never;
      }

      return { rows: [] } as never;
    });

    const bundle = await saveTrackLyricsContent({
      userId: 'user-1',
      albumId: 'rubber-soul',
      trackId: 'track-uuid',
      uiLang: 'en',
      content: 'Saved lyrics',
    });

    expect(bundle?.content).toBe('Saved lyrics');

    const canonicalInsert = insertParams[0];
    expect(canonicalInsert).toBeDefined();
    expect(canonicalInsert?.[4]).toBe(readyLocaleTrack.src);
    expect(canonicalInsert?.[8]).toBe('ready');
    expect(canonicalInsert?.[11]).toBe('public');
    expect(canonicalInsert?.[12]).toBe('public');

    const localeInsert = insertParams[1];
    expect(localeInsert?.[8]).toBe('ready');
  });
});
