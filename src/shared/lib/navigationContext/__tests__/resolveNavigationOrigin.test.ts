import { describe, expect, test } from '@jest/globals';

import { resolveChildContextNavMode, resolveNavigationOrigin } from '../resolveNavigationOrigin';

describe('resolveNavigationOrigin', () => {
  test('returns artist hub origin for home page', () => {
    expect(resolveNavigationOrigin('/')).toEqual({
      isArtistHubOrigin: true,
      listSection: null,
      isDirectEntry: false,
    });
  });

  test('returns list section for first-level routes', () => {
    expect(resolveNavigationOrigin('/albums')).toEqual({
      isArtistHubOrigin: false,
      listSection: 'albums',
      isDirectEntry: false,
    });
    expect(resolveNavigationOrigin('/stems')).toEqual({
      isArtistHubOrigin: false,
      listSection: 'mixer',
      isDirectEntry: false,
    });
  });

  test('maps child detail pages to their parent list section', () => {
    expect(resolveNavigationOrigin('/albums/demo-album')).toEqual({
      isArtistHubOrigin: false,
      listSection: 'albums',
      isDirectEntry: false,
    });
  });

  test('returns direct entry when previous path is unknown', () => {
    expect(resolveNavigationOrigin(null)).toEqual({
      isArtistHubOrigin: false,
      listSection: null,
      isDirectEntry: true,
    });
  });
});

describe('resolveChildContextNavMode', () => {
  test('uses artist-only mode when opened from artist hub', () => {
    expect(
      resolveChildContextNavMode({
        isArtistHubOrigin: true,
        listSection: null,
        isDirectEntry: false,
      })
    ).toBe('artist-only');
  });

  test('uses list-and-artist when opened from parent list', () => {
    expect(
      resolveChildContextNavMode({
        isArtistHubOrigin: false,
        listSection: 'albums',
        isDirectEntry: false,
      })
    ).toBe('list-and-artist');
  });

  test('uses list-and-artist when opened from another first-level section', () => {
    expect(
      resolveChildContextNavMode({
        isArtistHubOrigin: false,
        listSection: 'articles',
        isDirectEntry: false,
      })
    ).toBe('list-and-artist');

    expect(
      resolveChildContextNavMode({
        isArtistHubOrigin: false,
        listSection: 'mixer',
        isDirectEntry: false,
      })
    ).toBe('list-and-artist');
  });

  test('uses list-and-artist for direct entry', () => {
    expect(
      resolveChildContextNavMode({
        isArtistHubOrigin: false,
        listSection: null,
        isDirectEntry: true,
      })
    ).toBe('list-and-artist');
  });
});
