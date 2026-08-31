import { describe, expect, test } from '@jest/globals';
import {
  filterValidHeroHeaderImages,
  pickHeroBackgroundImage,
  pickHeroCoverSources,
  resolveHeroCoverSourcesFromUrl,
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
