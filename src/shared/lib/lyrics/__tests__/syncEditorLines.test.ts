import type { TrackLyricsBundle } from '../types';
import { buildSyncEditorLinesFromBundle } from '../syncEditorLines';

function syncedBundle(
  content: string,
  syncedLines: Array<{ text: string; startTime: number; endTime?: number }>
): TrackLyricsBundle {
  return {
    albumId: 'album-1',
    trackId: '1',
    lang: 'ru',
    content,
    syncedLines,
    state: 'synced',
    syncedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('buildSyncEditorLinesFromBundle', () => {
  test('assigns independent timings to duplicate lyric text by line index', () => {
    const content = ['A', 'B', 'C', 'A', 'D', 'C', 'A'].join('\n');
    const syncedLines = [
      { text: 'A', startTime: 1, endTime: 2 },
      { text: 'B', startTime: 3, endTime: 4 },
      { text: 'C', startTime: 5, endTime: 6 },
      { text: 'A', startTime: 7, endTime: 8 },
      { text: 'D', startTime: 9, endTime: 10 },
      { text: 'C', startTime: 11, endTime: 12 },
      { text: 'A', startTime: 13, endTime: 14 },
    ];

    const { lines } = buildSyncEditorLinesFromBundle(syncedBundle(content, syncedLines));

    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatchObject({ text: 'A', startTime: 1, endTime: 2 });
    expect(lines[3]).toMatchObject({ text: 'A', startTime: 7, endTime: 8 });
    expect(lines[6]).toMatchObject({ text: 'A', startTime: 13, endTime: 14 });
    expect(lines[2]).toMatchObject({ text: 'C', startTime: 5, endTime: 6 });
    expect(lines[5]).toMatchObject({ text: 'C', startTime: 11, endTime: 12 });
  });

  test('preserves independent timings for repeated chorus lines (production pattern)', () => {
    const chorus = 'Сон, удалённый тошнотой';
    const content = ['Intro line', chorus, 'Bridge line', chorus, 'Outro line', chorus].join('\n');
    const syncedLines = [
      { text: 'Intro line', startTime: 10, endTime: 12 },
      { text: chorus, startTime: 25.16, endTime: 28.88 },
      { text: 'Bridge line', startTime: 40, endTime: 44 },
      { text: chorus, startTime: 84.47, endTime: 88.19 },
      { text: 'Outro line', startTime: 90, endTime: 95 },
      { text: chorus, startTime: 120.5, endTime: 124.2 },
    ];

    const { lines } = buildSyncEditorLinesFromBundle(syncedBundle(content, syncedLines));

    expect(lines[1]).toMatchObject({ text: chorus, startTime: 25.16, endTime: 28.88 });
    expect(lines[3]).toMatchObject({ text: chorus, startTime: 84.47, endTime: 88.19 });
    expect(lines[5]).toMatchObject({ text: chorus, startTime: 120.5, endTime: 124.2 });
  });

  test('drops timing when synced line at index no longer matches content text', () => {
    const content = 'Old line\nNew line';
    const bundle = syncedBundle(content, [
      { text: 'Old line', startTime: 1, endTime: 2 },
      { text: 'Stale text', startTime: 3, endTime: 4 },
    ]);

    const { lines } = buildSyncEditorLinesFromBundle(bundle);

    expect(lines[0]).toMatchObject({ text: 'Old line', startTime: 1, endTime: 2 });
    expect(lines[1]).toMatchObject({ text: 'New line', startTime: 0, endTime: undefined });
  });

  test('returns untimed lines when bundle is not synced', () => {
    const content = 'A\nA\nA';
    const bundle: TrackLyricsBundle = {
      albumId: 'album-1',
      trackId: '1',
      lang: 'ru',
      content,
      syncedLines: null,
      state: 'text-only',
      syncedAt: null,
    };

    const { lines } = buildSyncEditorLinesFromBundle(bundle);

    expect(lines).toEqual([
      { text: 'A', startTime: 0, endTime: undefined },
      { text: 'A', startTime: 0, endTime: undefined },
      { text: 'A', startTime: 0, endTime: undefined },
    ]);
  });

  test('ignores extra synced rows when content has fewer lines', () => {
    const content = 'Only one';
    const { lines } = buildSyncEditorLinesFromBundle(
      syncedBundle(content, [
        { text: 'Only one', startTime: 5, endTime: 6 },
        { text: 'Removed line', startTime: 7, endTime: 8 },
      ])
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ startTime: 5, endTime: 6 });
  });
});
