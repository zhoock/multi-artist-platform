import { beforeEach, describe, expect, test } from '@jest/globals';
import {
  consumeAlbumDetailsStale,
  isAlbumDetailsStale,
  markAlbumDetailsStale,
  markAlbumDetailsStaleMany,
  resetAlbumDetailsStaleForTests,
} from '../albumDetailsStale';

describe('albumDetailsStale', () => {
  beforeEach(() => {
    resetAlbumDetailsStaleForTests();
  });

  test('marks and consumes album ids so last-good cache cannot stick after dashboard edits', () => {
    markAlbumDetailsStaleMany(['album-1', 'album-1-renamed']);
    expect(isAlbumDetailsStale('album-1')).toBe(true);
    expect(isAlbumDetailsStale('album-1-renamed')).toBe(true);

    expect(consumeAlbumDetailsStale('album-1')).toBe(true);
    expect(isAlbumDetailsStale('album-1')).toBe(false);
    expect(isAlbumDetailsStale('album-1-renamed')).toBe(true);
  });

  test('ignores empty ids', () => {
    markAlbumDetailsStale('  ');
    markAlbumDetailsStale(null);
    expect(isAlbumDetailsStale('')).toBe(false);
  });
});
