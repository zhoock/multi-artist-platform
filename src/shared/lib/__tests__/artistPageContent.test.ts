import { describe, expect, test } from '@jest/globals';
import type { TracksProps } from '@models';

import {
  artistHasPublicPageContent,
  countPublishedPublicArticles,
  filterAlbumsForArtistPageSurface,
  hasVisitorVisibleArtistContent,
  isArtistProfileEmpty,
  isArticlePublicOnArtistPage,
  needsArtistOnboarding,
  profileHasPublicBodyContent,
} from '../artistPageContent';

const mockTrack: TracksProps = {
  id: '1',
  title: 'Track',
  content: '',
  duration: 180,
  src: 'track.mp3',
  order_index: 10,
};

describe('artistPageContent', () => {
  test('needsArtistOnboarding only for completely empty artists', () => {
    expect(needsArtistOnboarding({ albumsCount: 0, articlesCount: 0, profileIsEmpty: true })).toBe(
      true
    );
    expect(needsArtistOnboarding({ albumsCount: 1, articlesCount: 0, profileIsEmpty: true })).toBe(
      false
    );
    expect(needsArtistOnboarding({ albumsCount: 0, articlesCount: 1, profileIsEmpty: true })).toBe(
      false
    );
    expect(needsArtistOnboarding({ albumsCount: 0, articlesCount: 0, profileIsEmpty: false })).toBe(
      false
    );
  });

  test('isArtistProfileEmpty checks substantive profile fields only', () => {
    expect(isArtistProfileEmpty({})).toBe(true);
    expect(isArtistProfileEmpty({ siteName: 'Band' })).toBe(true);
    expect(isArtistProfileEmpty({ headerImages: ['hero.jpg'] })).toBe(false);
    expect(isArtistProfileEmpty({ theBand: ['Bio'] })).toBe(false);
  });

  test('filterAlbumsForArtistPageSurface hides empty albums for visitors and hidden releases for owners', () => {
    const albums = [
      {
        albumId: 'a1',
        album: 'Draft',
        artist: 'Band',
        fullName: 'Band — Draft',
        description: '',
        release: { date: '2024-01-01' },
        tracks: [],
        buttons: {},
        details: [],
        isPublic: false,
      },
      {
        albumId: 'a2',
        album: 'Public Empty',
        artist: 'Band',
        fullName: 'Band — Public Empty',
        description: '',
        release: { date: '2024-01-01' },
        tracks: [],
        buttons: {},
        details: [],
        isPublic: true,
      },
      {
        albumId: 'a3',
        album: 'Published',
        artist: 'Band',
        fullName: 'Band — Published',
        description: '',
        release: { date: '2024-01-01' },
        tracks: [mockTrack],
        buttons: {},
        details: [],
        isPublic: true,
      },
      {
        albumId: 'a4',
        album: 'Hidden Release',
        artist: 'Band',
        fullName: 'Band — Hidden Release',
        description: '',
        release: { date: '2024-01-01' },
        tracks: [mockTrack],
        buttons: {},
        details: [],
        isPublic: false,
        isPublished: true,
      },
    ];

    expect(filterAlbumsForArtistPageSurface(albums, true)).toHaveLength(2);
    expect(filterAlbumsForArtistPageSurface(albums, false)).toHaveLength(1);
  });

  test('hasVisitorVisibleArtistContent accepts tracks, articles, or profile body', () => {
    expect(
      hasVisitorVisibleArtistContent({
        albums: [
          {
            album: 'Release',
            artist: 'Band',
            fullName: 'Band — Release',
            description: '',
            release: { date: '2024-01-01' },
            tracks: [mockTrack],
            buttons: {},
            details: [],
            isPublic: true,
          },
        ],
        articlesCount: 0,
        profileHasPublicBody: false,
      })
    ).toBe(true);

    expect(
      hasVisitorVisibleArtistContent({
        albums: [],
        articlesCount: 2,
        profileHasPublicBody: false,
      })
    ).toBe(true);

    expect(
      hasVisitorVisibleArtistContent({
        albums: [],
        articlesCount: 0,
        profileHasPublicBody: true,
      })
    ).toBe(true);

    expect(
      hasVisitorVisibleArtistContent({
        albums: [],
        articlesCount: 0,
        profileHasPublicBody: false,
      })
    ).toBe(false);
  });

  test('profileHasPublicBodyContent ignores site name alone', () => {
    expect(profileHasPublicBodyContent({ siteName: 'Band' })).toBe(false);
    expect(profileHasPublicBodyContent({ theBand: ['Bio'] })).toBe(true);
  });

  test('isArticlePublicOnArtistPage requires published non-hidden articles', () => {
    expect(isArticlePublicOnArtistPage({ isDraft: true })).toBe(false);
    expect(isArticlePublicOnArtistPage({ isDraft: false, visibility: 'hidden' })).toBe(false);
    expect(isArticlePublicOnArtistPage({ isDraft: false, visibility: 'public' })).toBe(true);
  });

  test('countPublishedPublicArticles ignores drafts and hidden articles', () => {
    expect(
      countPublishedPublicArticles([
        { articleId: 'a1', isDraft: true } as never,
        { articleId: 'a2', isDraft: false, visibility: 'hidden' } as never,
        { articleId: 'a3', isDraft: false, visibility: 'public' } as never,
      ])
    ).toBe(1);
  });

  test('artistHasPublicPageContent mirrors visitor visibility rules', () => {
    expect(
      artistHasPublicPageContent({
        albums: [],
        articles: [{ articleId: 'a1', isDraft: false, visibility: 'public' } as never],
        profileHasPublicBody: false,
      })
    ).toBe(true);

    expect(
      artistHasPublicPageContent({
        albums: [],
        articles: [{ articleId: 'a1', isDraft: true } as never],
        profileHasPublicBody: false,
      })
    ).toBe(false);

    expect(
      artistHasPublicPageContent({
        albums: [],
        articles: [],
        profileHasPublicBody: true,
      })
    ).toBe(true);
  });
});
