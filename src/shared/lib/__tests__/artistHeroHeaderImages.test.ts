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
  resetHeroCoverPickCacheForTests,
  resolveHeroCoverPreloadTarget,
  resolveHeroCoverSourcesFromUrl,
  resolveHeroCoverVariantWidth,
  setCachedArtistHeroHeaderImages,
} from '../artistHeroHeaderImages';

const HERO_JPG = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
const HERO_B_JPG = '/api/proxy-image?path=users/u1/hero/other-1920.jpg';

beforeEach(() => {
  resetHeroCoverPickCacheForTests();
});

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
  test('derives responsive srcsets from -1920.jpg proxy URL (webp + jpg only)', () => {
    expect(resolveHeroCoverSourcesFromUrl(HERO_JPG)).toEqual({
      jpg: HERO_JPG,
      avifSrcSet: null,
      webpSrcSet: expectedSrcSet('webp'),
      jpgSrcSet: expectedSrcSet('jpg'),
      sizes: HERO_COVER_SIZES,
      avif: null,
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
    });
  });

  test('parses legacy image-set() and still serves webp/jpg (no avif in picture)', () => {
    const imageSet =
      "image-set(url('/api/proxy-image?path=users/u1/hero/cover-1920.avif') type('image/avif'), url('/api/proxy-image?path=users/u1/hero/cover-1920.webp') type('image/webp'), url('/api/proxy-image?path=users/u1/hero/cover-1920.jpg') type('image/jpeg'))";
    expect(resolveHeroCoverSourcesFromUrl(imageSet)).toEqual({
      jpg: HERO_JPG,
      avifSrcSet: null,
      webpSrcSet: expectedSrcSet('webp'),
      jpgSrcSet: expectedSrcSet('jpg'),
      sizes: HERO_COVER_SIZES,
      avif: null,
      webp: '/api/proxy-image?path=users/u1/hero/cover-1920.webp',
    });
  });
});

describe('pickHeroCoverSources', () => {
  test('returns null when no images', () => {
    expect(pickHeroCoverSources([], 'seed')).toBeNull();
  });

  test('single image: deterministic jpg and srcsets for any visual key', () => {
    const first = pickHeroCoverSources([HERO_JPG], '/|test-artist');
    const second = pickHeroCoverSources([HERO_JPG], '/|test-artist');
    expect(first).toEqual(second);
    expect(first?.jpg).toBe(HERO_JPG);
    expect(first?.avifSrcSet).toBeNull();
    expect(first?.webpSrcSet).toContain('896w');
    expect(first?.webpSrcSet).toContain('1280w');
    expect(first?.avif).toBeNull();
    expect(first?.webp).toMatch(/-1920\.webp$/);
  });

  test('multiple images: stable across calls in the same page load (same slug in visual key)', () => {
    const images = [HERO_JPG, HERO_B_JPG];
    const key = buildHeroVisualKey('/en', 'test-artist');
    const first = pickHeroCoverSources(images, key);
    const second = pickHeroCoverSources(images, key);
    expect(first?.jpg).toBe(second?.jpg);
    expect([HERO_JPG, HERO_B_JPG]).toContain(first?.jpg ?? '');
  });

  test('multiple images: new page load can pick a different cover (cache cleared)', () => {
    const images = [HERO_JPG, HERO_B_JPG];
    const key = buildHeroVisualKey('/en', 'test-artist');

    let firstJpg: string | undefined;
    let secondJpg: string | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      resetHeroCoverPickCacheForTests();
      firstJpg = pickHeroCoverSources(images, key)?.jpg;
      resetHeroCoverPickCacheForTests();
      secondJpg = pickHeroCoverSources(images, key)?.jpg;
      if (firstJpg !== secondJpg) break;
    }
    expect(firstJpg).toBeDefined();
    expect(secondJpg).toBeDefined();
    expect(firstJpg).not.toBe(secondJpg);
  });

  test('multiple images: pathname in visual key does not change the pick (preload vs Hero pathname)', () => {
    const images = [HERO_JPG, HERO_B_JPG];
    const slugKey = 'test-artist';
    const a = pickHeroCoverSources(images, buildHeroVisualKey('/?artist=foo', slugKey));
    const b = pickHeroCoverSources(images, buildHeroVisualKey('/ru?artist=foo', slugKey));
    expect(a?.jpg).toBe(b?.jpg);
  });

  test('multiple images: preload and Hero share the same chosen base jpg', () => {
    const images = [HERO_JPG, HERO_B_JPG];
    const key = buildHeroVisualKey('/en', 'test-artist');
    const fromPick = pickHeroCoverSources(images, key);
    expect(fromPick).not.toBeNull();

    document.head
      .querySelectorAll('link[data-hero-cover-preload]')
      .forEach((node) => node.remove());
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    preloadHeroCoverFromHeaderImages('test-artist', images, key);

    const link = document.head.querySelector(
      'link[data-hero-cover-preload="test-artist"]'
    ) as HTMLLinkElement | null;
    expect(link?.getAttribute('href')).toBeTruthy();

    const expected = resolveHeroCoverPreloadTarget(fromPick!, 412, 2);
    expect(link?.getAttribute('href')).toBe(expected?.href);
  });
});

describe('pickHeroBackgroundImage', () => {
  test('returns empty string when no images', () => {
    expect(pickHeroBackgroundImage([], 'seed')).toBe('');
  });

  test('returns stable background for multiple images in one page load', () => {
    const images = ['https://cdn.example/a-1920.jpg', 'https://cdn.example/b-1920.jpg'];
    const key = '/|artist';
    const first = pickHeroBackgroundImage(images, key);
    const second = pickHeroBackgroundImage(images, key);
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
  test('mobile viewport preloads -896.webp', () => {
    const sources = pickHeroCoverSources([HERO_JPG], 'seed');
    expect(sources).not.toBeNull();

    expect(resolveHeroCoverPreloadTarget(sources!, 412, 2)).toEqual({
      href: '/api/proxy-image?path=users/u1/hero/cover-896.webp',
      type: 'image/webp',
    });
  });

  test('desktop 1920px @2x preloads -1280.webp', () => {
    const sources = pickHeroCoverSources([HERO_JPG], 'seed');
    expect(sources).not.toBeNull();

    expect(resolveHeroCoverPreloadTarget(sources!, 1920, 2)).toEqual({
      href: '/api/proxy-image?path=users/u1/hero/cover-1280.webp',
      type: 'image/webp',
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
    resetHeroCoverPickCacheForTests();
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

  test('preloads a single webp typed link matching mobile viewport variant', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    const seed = buildHeroVisualKey('/ru', 'test-artist');
    const sources = pickHeroCoverSources([HERO_JPG], seed);
    const preloadTarget = resolveHeroCoverPreloadTarget(sources!, 412, 2);

    preloadHeroCoverFromHeaderImages('test-artist', [HERO_JPG], seed);

    expect(readPreloadLinks()).toEqual([
      {
        href: preloadTarget?.href,
        type: 'image/webp',
        as: 'image',
        fetchPriority: 'high',
      },
    ]);
    expect(readPreloadLinks()[0]?.href).toContain('-896.webp');
  });

  test('preloads jpg only when webp variants are unavailable', () => {
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
    expect(links[0]?.type).toBe('image/webp');
    expect(links[0]?.href).toContain('-896.webp');
  });
});
