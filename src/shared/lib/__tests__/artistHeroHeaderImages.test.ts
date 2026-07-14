import { describe, expect, test } from '@jest/globals';
import { filterValidHeroHeaderImages, pickHeroBackgroundImage } from '../artistHeroHeaderImages';

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

describe('pickHeroBackgroundImage', () => {
  test('returns empty string when no images', () => {
    expect(pickHeroBackgroundImage([], 'seed')).toBe('');
  });

  test('returns stable background for the same seed', () => {
    const images = ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'];
    const first = pickHeroBackgroundImage(images, 'artist:test');
    const second = pickHeroBackgroundImage(images, 'artist:test');
    expect(first).toBe(second);
    expect(first).toMatch(/^url\('/);
  });
});
