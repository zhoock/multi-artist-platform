import { describe, expect, test } from '@jest/globals';
import { render } from '@testing-library/react';
import { HeroCoverImage } from '../HeroCoverImage';
import {
  HERO_COVER_SIZES,
  resolveHeroCoverSourcesFromUrl,
  resolveHeroCoverPreloadTarget,
} from '@shared/lib/artistHeroHeaderImages';

const HERO_JPG = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';

describe('HeroCoverImage', () => {
  test('renders webp + jpg responsive srcSet (no avif) and matches preload on mobile', () => {
    const sources = resolveHeroCoverSourcesFromUrl(HERO_JPG);
    expect(sources).not.toBeNull();

    render(<HeroCoverImage sources={sources!} />);

    const avifSource = document.querySelector('source[type="image/avif"]');
    const webpSource = document.querySelector('source[type="image/webp"]');
    const img = document.querySelector('img.hero__cover-image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(avifSource).toBeNull();

    expect(webpSource?.getAttribute('srcset')).toContain('-896.webp 896w');
    expect(webpSource?.getAttribute('srcset')).toContain('-1280.webp 1280w');
    expect(webpSource?.getAttribute('srcset')).toContain('-1920.webp 1920w');
    expect(webpSource?.getAttribute('sizes')).toBe(HERO_COVER_SIZES);

    expect(img.getAttribute('srcset')).toContain('-896.jpg 896w');
    expect(img.getAttribute('sizes')).toBe(HERO_COVER_SIZES);
    expect(img.getAttribute('src')).toBe(HERO_JPG);

    const preloadTarget = resolveHeroCoverPreloadTarget(sources!, 412, 2);
    expect(preloadTarget?.href).toContain('-896.webp');
    expect(webpSource?.getAttribute('srcset')).toContain(preloadTarget!.href);
  });
});
