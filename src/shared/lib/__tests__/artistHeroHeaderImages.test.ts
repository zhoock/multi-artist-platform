import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
  HERO_COVER_SIZES,
  buildHeroVisualKey,
  deriveHeroVariantUrl,
  filterValidHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
  pickHeroBackgroundImage,
  pickHeroCoverSources,
  preloadHeroCoverFromHeaderImages,
  resolveHeroCoverPreloadTarget,
  resolveHeroCoverSourcesFromUrl,
  resolveHeroCoverVariantWidth,
  setCachedArtistHeroHeaderImages,
} from '../artistHeroHeaderImages';

const HERO_JPG = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';

function expectedSrcSet(ext: 'avif' | 'webp' | 'jpg'): string {
  const suffix = ext === 'jpg' ? 'jpg' : ext;
  return [
    `/api/proxy-image?path=users/u1/hero/cover-896.${suffix} 896w`,
    `/api/proxy-image?path=users/u1/hero/cover-1280.${suffix} 1280w`,
    `/api/proxy-image?path=users/u1/hero/cover-1920.${suffix} 1920w`,
  ].join(', ');
}

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

describe('deriveHeroVariantUrl', () => {
  test('resolves 896 / 1280 / 1920 avif variants from canonical jpg', () => {
    expect(deriveHeroVariantUrl(HERO_JPG, 'avif', 896)).toBe(
      '/api/proxy-image?path=users/u1/hero/cover-896.avif'
    );
    expect(deriveHeroVariantUrl(HERO_JPG, 'avif', 1280)).toBe(
      '/api/proxy-image?path=users/u1/hero/cover-1280.avif'
    );
    expect(deriveHeroVariantUrl(HERO_JPG, 'avif', 1920)).toBe(
      '/api/proxy-image?path=users/u1/hero/cover-1920.avif'
    );
  });
});

describe('resolveHeroCoverSourcesFromUrl', () => {
  test('derives responsive srcsets from -1920.jpg proxy URL', () => {
    expect(resolveHeroCoverSourcesFromUrl(HERO_JPG)).toEqual({
      jpg: HERO_JPG,
      avifSrcSet: expectedSrcSet('avif'),
      webpSrcSet: expectedSrcSet('webp'),
      jpgSrcSet: expectedSrcSet('jpg'),
      sizes: HERO_COVER_SIZES,
      avif: '/api/proxy-image?path=users/u1/hero/cover-1920.avif',
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
    });
  });

  test('parses image-set() with avif/webp/jpg', () => {
    const imageSet =
      "image-set(url('/api/proxy-image?path=users/u1/hero/cover-1920.avif') type('image/avif'), url('/api/proxy-image?path=users/u1/hero/cover-1920.webp') type('image/webp'), url('/api/proxy-image?path=users/u1/hero/cover-1920.jpg') type('image/jpeg'))";
    expect(resolveHeroCoverSourcesFromUrl(imageSet)).toEqual({
      jpg: HERO_JPG,
      avifSrcSet: expectedSrcSet('avif'),
      webpSrcSet: expectedSrcSet('webp'),
      jpgSrcSet: expectedSrcSet('jpg'),
      sizes: HERO_COVER_SIZES,
      avif: '/api/proxy-image?path=users/u1/hero/cover-1920.avif',
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
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
    expect(first?.avifSrcSet).toContain('896w');
    expect(first?.webpSrcSet).toContain('1280w');
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

describe('resolveHeroCoverVariantWidth', () => {
  test('mobile 412px @2x selects 896', () => {
    expect(resolveHeroCoverVariantWidth(412, 2)).toBe(896);
  });

  test('tablet 768px @2x selects 896', () => {
    expect(resolveHeroCoverVariantWidth(768, 2)).toBe(896);
  });

  test('desktop 1280px @2x selects 896', () => {
    expect(resolveHeroCoverVariantWidth(1280, 2)).toBe(896);
  });

  test('desktop 1280px @3x selects 1280', () => {
    expect(resolveHeroCoverVariantWidth(1280, 3)).toBe(1280);
  });

  test('desktop 1920px @2x selects 1280', () => {
    expect(resolveHeroCoverVariantWidth(1920, 2)).toBe(1280);
  });

  test('desktop 1920px @3x selects 1920', () => {
    expect(resolveHeroCoverVariantWidth(1920, 3)).toBe(1920);
  });
});

describe('resolveHeroCoverPreloadTarget', () => {
  test('mobile viewport preloads -896.avif', () => {
    const sources = pickHeroCoverSources([HERO_JPG], 'seed');
    expect(sources).not.toBeNull();

    expect(resolveHeroCoverPreloadTarget(sources!, 412, 2)).toEqual({
      href: '/api/proxy-image?path=users/u1/hero/cover-896.avif',
      type: 'image/avif',
    });
  });

  test('desktop 1920px @2x preloads -1280.avif', () => {
    const sources = pickHeroCoverSources([HERO_JPG], 'seed');
    expect(sources).not.toBeNull();

    expect(resolveHeroCoverPreloadTarget(sources!, 1920, 2)).toEqual({
      href: '/api/proxy-image?path=users/u1/hero/cover-1280.avif',
      type: 'image/avif',
    });
  });

  test('falls back to jpg when modern formats are unavailable', () => {
    const coverWithoutExt = 'https://cdn.example/users/u1/hero/cover-no-ext';
    const sources = resolveHeroCoverSourcesFromUrl(coverWithoutExt);
    expect(sources).not.toBeNull();
    expect(resolveHeroCoverPreloadTarget(sources!, 412, 2)).toEqual({
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

  test('preloads a single avif typed link matching mobile viewport variant', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    const seed = buildHeroVisualKey('/ru', 'test-artist');
    const sources = pickHeroCoverSources([HERO_JPG], seed);
    const preloadTarget = resolveHeroCoverPreloadTarget(sources!, 412, 2);

    preloadHeroCoverFromHeaderImages('test-artist', [HERO_JPG], seed);

    expect(readPreloadLinks()).toEqual([
      {
        href: preloadTarget?.href,
        type: 'image/avif',
        as: 'image',
        fetchPriority: 'high',
      },
    ]);
    expect(readPreloadLinks()[0]?.href).toContain('-896.avif');
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
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const seed = buildHeroVisualKey('/ru', 'test-artist');

    preloadHeroCoverFromHeaderImages('test-artist', [HERO_JPG], seed);
    preloadHeroCoverFromHeaderImages('test-artist', [HERO_JPG], seed);

    expect(readPreloadLinks()).toHaveLength(1);
  });

  test('setCachedArtistHeroHeaderImages starts typed preload before React render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    setCachedArtistHeroHeaderImages('test-artist', [HERO_JPG]);

    const links = readPreloadLinks();
    expect(links).toHaveLength(1);
    expect(links[0]?.type).toBe('image/avif');
    expect(links[0]?.href).toContain('-896.avif');
  });
});
