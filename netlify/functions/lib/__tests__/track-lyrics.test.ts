import { composeTrackLyricsBundle, parseSyncedLyricsJson } from '../track-lyrics';

jest.mock('../db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

describe('track-lyrics builder', () => {
  test('composeTrackLyricsBundle ignores legacy-style plain sync rows', () => {
    const bundle = composeTrackLyricsBundle({
      albumId: 'album-1',
      trackId: '1',
      canonicalLang: 'ru',
      content: 'Line one\nLine two',
      authorship: 'Author',
      syncedRow: {
        synced_lyrics: [
          { text: 'Line one', startTime: 0 },
          { text: 'Line two', startTime: 0 },
        ],
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(bundle.state).toBe('text-only');
    expect(bundle.syncedLines).toBeNull();
  });

  test('no sync row with content is text-only even if legacy column had timings elsewhere', () => {
    const bundle = composeTrackLyricsBundle({
      albumId: 'album-1',
      trackId: '1',
      canonicalLang: 'ru',
      content: 'Hello',
      syncedRow: null,
    });

    expect(bundle.state).toBe('text-only');
    expect(bundle.syncedLines).toBeNull();
  });

  test('timed sync row produces synced state', () => {
    const lines = [{ text: 'Hello', startTime: 1.2 }];
    const bundle = composeTrackLyricsBundle({
      albumId: 'album-1',
      trackId: '1',
      canonicalLang: 'ru',
      content: 'Hello',
      syncedRow: { synced_lyrics: lines, updated_at: new Date() },
    });

    expect(bundle.state).toBe('synced');
    expect(bundle.syncedLines).toEqual(lines);
  });

  test('parseSyncedLyricsJson filters invalid entries', () => {
    expect(parseSyncedLyricsJson([{ text: 'ok', startTime: 1 }, { text: 'bad' }, null])).toEqual([
      { text: 'ok', startTime: 1 },
    ]);
  });
});
