import {
  isTimedSync,
  projectLyricsBundleFields,
  resolveLyricsSyncState,
} from '../resolveLyricsSyncState';

describe('resolveLyricsSyncState', () => {
  test('returns empty when no content and no timed sync', () => {
    expect(resolveLyricsSyncState({ content: '', syncedLines: null })).toBe('empty');
    expect(resolveLyricsSyncState({ content: '   ', syncedLines: [] })).toBe('empty');
  });

  test('returns text-only when content exists but no timings', () => {
    expect(resolveLyricsSyncState({ content: 'Hello\nWorld', syncedLines: null })).toBe(
      'text-only'
    );
    expect(
      resolveLyricsSyncState({
        content: 'Hello',
        syncedLines: [{ text: 'Hello', startTime: 0 }],
      })
    ).toBe('text-only');
  });

  test('returns synced when at least one line has startTime > 0', () => {
    expect(
      resolveLyricsSyncState({
        content: 'Line',
        syncedLines: [{ text: 'Line', startTime: 1.5 }],
      })
    ).toBe('synced');
  });

  test('isTimedSync matches resolver synced branch', () => {
    expect(isTimedSync([{ text: 'a', startTime: 0 }])).toBe(false);
    expect(isTimedSync([{ text: 'a', startTime: 0.1 }])).toBe(true);
    expect(isTimedSync(null)).toBe(false);
  });

  test('projectLyricsBundleFields nulls syncedLines unless synced', () => {
    expect(
      projectLyricsBundleFields({
        content: 'x',
        syncedLines: [{ text: 'x', startTime: 0 }],
      })
    ).toEqual({ state: 'text-only', syncedLines: null });

    const lines = [{ text: 'x', startTime: 2 }];
    expect(
      projectLyricsBundleFields({
        content: 'x',
        syncedLines: lines,
      })
    ).toEqual({ state: 'synced', syncedLines: lines });
  });
});
