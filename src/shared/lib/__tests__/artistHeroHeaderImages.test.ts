import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
  buildHeroVisualKey,
  filterValidHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
  pickHeroBackgroundImage,
  pickHeroCoverSources,
  preloadHeroCoverFromHeaderImages,
  resolveHeroCoverPreloadTarget,
  resolveHeroCoverSourcesFromUrl,
  setCachedArtistHeroHeaderImages,
} from '../artistHeroHeaderImages';

describe('filterValidHeroHeaderImages', () => {
  test('keeps only hero folder paths', () => {
    expect(
      filterValidHeroHeaderImages([
        'https://cdn.example/users/u1/hero/cover.jpg',
        'https://cdn.example/users/u1/articles/pic.jpg',
        'https://proxy-image?path=users/u1/hero-1.webp',
      ])
    ).toEqual([
      'https://cdn.example/users/u1/hero/cover.jpg',
      'https://proxy-image?path=users/u1/hero-1.webp',
    ]);
  });
});

describe('resolveHeroCoverSourcesFromUrl', () => {
  test('derives avif/webp/jpg from -1920.jpg proxy URL', () => {
    const jpg = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
    expect(resolveHeroCoverSourcesFromUrl(jpg)).toEqual({
      avif: '/api/proxy-image?path=users/u1/hero/cover-1920.avif',
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
      jpg,
    });
  });

  test('parses image-set() with avif/webp/jpg', () => {
    const imageSet =
      "image-set(url('/api/proxy-image?path=users/u1/hero/cover-1920.avif') type('image/avif'), url('/api/proxy-image?path=users/u1/hero/cover-1920.webp') type('image/webp'), url('/api/proxy-image?path=users/u1/hero/cover-1920.jpg') type('image/jpeg'))";
    expect(resolveHeroCoverSourcesFromUrl(imageSet)).toEqual({
      avif: '/api/proxy-image?path=users/u1/hero/cover-1920.avif',
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
      jpg: '/api/proxy-image?path=users/u1/hero/cover-1920.jpg',
    });
  });
});

describe('pickHeroCoverSources', () => {
  test('returns null when no images', () => {
    expect(pickHeroCoverSources([], 'seed')).toBeNull();
  });

  test('returns stable sources for the same seed', () => {
    const images = [
      '/api/proxy-image?path=users/u1/hero/a-1920.jpg',
      '/api/proxy-image?path=users/u1/hero/b-1920.jpg',
    ];
    const first = pickHeroCoverSources(images, 'artist:test');
    const second = pickHeroCoverSources(images, 'artist:test');
    expect(first).toEqual(second);
    expect(first?.jpg).toMatch(/-1920\.jpg$/);
    expect(first?.webp).toMatch(/-1920\.webp$/);
    expect(first?.avif).toMatch(/-1920\.avif$/);
  });
});

describe('pickHeroBackgroundImage', () => {
  test('returns empty string when no images', () => {
    expect(pickHeroBackgroundImage([], 'seed')).toBe('');
  });

  test('returns stable background for the same seed', () => {
    const images = ['https://cdn.example/a-1920.jpg', 'https://cdn.example/b-1920.jpg'];
    const first = pickHeroBackgroundImage(images, 'artist:test');
    const second = pickHeroBackgroundImage(images, 'artist:test');
    expect(first).toBe(second);
    expect(first).toMatch(/^url\('/);
  });
});

describe('buildHeroVisualKey', () => {
  test('matches Hero pathname|slug seed', () => {
    expect(buildHeroVisualKey('/ru', 'Test-Artist')).toBe('/|test-artist');
  });
});

describe('resolveHeroCoverPreloadTarget', () => {
  test('prefers avif when avif source exists', () => {
    const jpg = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
    const sources = pickHeroCoverSources([jpg], 'seed');
    expect(sources).not.toBeNull();

    expect(resolveHeroCoverPreloadTarget(sources!)).toEqual({
      href: sources!.avif,
      type: 'image/avif',
    });
  });

  test('falls back to jpg when modern formats are unavailable', () => {
    const coverWithoutExt = 'https://cdn.example/users/u1/hero/cover-no-ext';
    const sources = resolveHeroCoverSourcesFromUrl(coverWithoutExt);
    expect(sources).not.toBeNull();
    expect(resolveHeroCoverPreloadTarget(sources!)).toEqual({
      href: coverWithoutExt,
      type: 'image/jpeg',
    });
  });
});

describe('preloadHeroCoverFromHeaderImages', () => {
  beforeEach(() => {
    invalidateArtistHeroHeaderImagesCache();
    document.head
      .querySelectorAll('link[data-hero-cover-preload]')
      .forEach((node) => node.remove());
  });

  afterEach(() => {
    document.head
      .querySelectorAll('link[data-hero-cover-preload]')
      .forEach((node) => node.remove());
  });

  function readPreloadLinks() {
    return Array.from(document.head.querySelectorAll('link[data-hero-cover-preload]')).map(
      (node) => {
        const link = node as HTMLLinkElement;
        return {
          href: link.getAttribute('href'),
          type: link.getAttribute('type'),
          as: link.as || link.getAttribute('as'),
          fetchPriority: link.fetchPriority || link.getAttribute('fetchpriority'),
        };
      }
    );
  }

  test('preloads a single avif typed link for modern picture sources', () => {
    const jpg = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
    const seed = buildHeroVisualKey('/ru', 'test-artist');
    const sources = pickHeroCoverSources([jpg], seed);

    preloadHeroCoverFromHeaderImages('test-artist', [jpg], seed);

    expect(readPreloadLinks()).toEqual([
      {
        href: sources?.avif,
        type: 'image/avif',
        as: 'image',
        fetchPriority: 'high',
      },
    ]);
  });

  test('preloads jpg only when avif/webp are unavailable', () => {
    const coverWithoutExt = 'https://cdn.example/users/u1/hero/cover-no-ext';

    preloadHeroCoverFromHeaderImages('test-artist', [coverWithoutExt], '/|test-artist');

    expect(readPreloadLinks()).toEqual([
      {
        href: coverWithoutExt,
        type: 'image/jpeg',
        as: 'image',
        fetchPriority: 'high',
      },
    ]);
  });

  test('dedupes preload for the same artist and cover URL', () => {
    const jpg = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
    const seed = buildHeroVisualKey('/ru', 'test-artist');

    preloadHeroCoverFromHeaderImages('test-artist', [jpg], seed);
    preloadHeroCoverFromHeaderImages('test-artist', [jpg], seed);

    expect(readPreloadLinks()).toHaveLength(1);
  });

  test('setCachedArtistHeroHeaderImages starts typed preload before React render', () => {
    const jpg = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';

    setCachedArtistHeroHeaderImages('test-artist', [jpg]);

    const links = readPreloadLinks();
    expect(links).toHaveLength(1);
    expect(links[0]?.type).toBe('image/avif');
  });
});
