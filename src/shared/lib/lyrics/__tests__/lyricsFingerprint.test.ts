import {
  lyricsFingerprintFromContent,
  lyricsFingerprintFromSyncedLines,
  lyricsFingerprintsMatch,
} from '../lyricsFingerprint';

describe('lyricsFingerprint', () => {
  test('normalizes content lines', () => {
    expect(lyricsFingerprintFromContent('  a \r\n\r\n b  ')).toBe('a\nb');
  });

  test('matches synced lines to content fingerprint', () => {
    const content = 'Line one\nLine two';
    const synced = [
      { text: 'Line one', startTime: 0 },
      { text: 'Line two', startTime: 1 },
    ];
    expect(lyricsFingerprintsMatch(content, synced)).toBe(true);
    expect(lyricsFingerprintsMatch('Different', synced)).toBe(false);
  });

  test('lyricsFingerprintFromSyncedLines ignores empty text lines', () => {
    expect(
      lyricsFingerprintFromSyncedLines([
        { text: 'a', startTime: 0 },
        { text: '   ', startTime: 0 },
        { text: 'b', startTime: 0 },
      ])
    ).toBe('a\nb');
  });
});
