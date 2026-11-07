import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { HeroCoverImage } from '../HeroCoverImage';
import {
  HERO_COVER_SIZES,
  buildHeroVisualKey,
  resetHeroCoverPickCacheForTests,
  resolveHeroCoverSourcesFromUrl,
  resolveHeroCoverPreloadTarget,
} from '@shared/lib/artistHeroHeaderImages';

const HERO_JPG = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
const HERO_B_JPG = '/api/proxy-image?path=users/u1/hero/other-1920.jpg';
const VISUAL_KEY = buildHeroVisualKey('/en', 'test-artist');

function queryHeroCoverImg(): HTMLImageElement | null {
  return document.querySelector('img.hero__cover-image');
}

beforeEach(() => {
  resetHeroCoverPickCacheForTests();
  /** Primary URL in `buildHeroCoverFallbackUrls` is `headerImages[Math.floor(random * n)]`. */
  jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HeroCoverImage', () => {
  test('renders webp + jpg responsive srcSet (no avif) and matches preload on mobile', () => {
    const sources = resolveHeroCoverSourcesFromUrl(HERO_JPG);
    expect(sources).not.toBeNull();

    render(
      <HeroCoverImage
        headerImages={[HERO_JPG]}
        visualKey={VISUAL_KEY}
        onReadyForPaint={jest.fn()}
      />
    );

    const avifSource = document.querySelector('source[type="image/avif"]');
    const webpSource = document.querySelector('source[type="image/webp"]');
    const img = queryHeroCoverImg();
    expect(img).toBeTruthy();
    expect(avifSource).toBeNull();

    expect(webpSource?.getAttribute('srcset')).toContain('-896.webp 896w');
    expect(webpSource?.getAttribute('srcset')).toContain('-1280.webp 1280w');
    expect(webpSource?.getAttribute('srcset')).toContain('-1920.webp 1920w');
    expect(webpSource?.getAttribute('sizes')).toBe(HERO_COVER_SIZES);

    expect(img?.getAttribute('srcset')).toContain('-896.jpg 896w');
    expect(img?.getAttribute('sizes')).toBe(HERO_COVER_SIZES);
    expect(img?.getAttribute('src')).toBe(HERO_JPG);

    const preloadTarget = resolveHeroCoverPreloadTarget(sources!, 412, 2);
    expect(preloadTarget?.href).toContain('-896.webp');
    expect(webpSource?.getAttribute('srcset')).toContain(preloadTarget!.href);
  });

  test('keeps cover hidden (pending) until load succeeds', () => {
    render(<HeroCoverImage headerImages={[HERO_JPG]} visualKey={VISUAL_KEY} />);
    const img = queryHeroCoverImg();
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(true);

    fireEvent.load(img!);
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(false);
  });

  test('load error notifies parent while more fallbacks remain', () => {
    const onCoverLoadError = jest.fn();
    render(
      <HeroCoverImage
        headerImages={[HERO_JPG, HERO_B_JPG]}
        visualKey={VISUAL_KEY}
        onCoverLoadError={onCoverLoadError}
      />
    );

    const first = queryHeroCoverImg()!;
    expect(first.getAttribute('src')).toBe(HERO_JPG);
    fireEvent.error(first);
    expect(onCoverLoadError).toHaveBeenCalledTimes(1);
    expect(queryHeroCoverImg()?.getAttribute('src')).toBe(HERO_B_JPG);
  });

  test('after first error fallback can still load and show cover', () => {
    render(<HeroCoverImage headerImages={[HERO_JPG, HERO_B_JPG]} visualKey={VISUAL_KEY} />);

    fireEvent.error(queryHeroCoverImg()!);
    const second = queryHeroCoverImg();
    expect(second?.getAttribute('src')).toBe(HERO_B_JPG);
    expect(second?.classList.contains('hero__cover-image--pending')).toBe(true);

    fireEvent.load(second!);
    expect(second?.classList.contains('hero__cover-image--pending')).toBe(false);
    expect(document.querySelector('.hero__cover-layer')).not.toBeNull();
  });

  test('first image fails — tries the next header image', () => {
    render(<HeroCoverImage headerImages={[HERO_JPG, HERO_B_JPG]} visualKey={VISUAL_KEY} />);

    const first = queryHeroCoverImg();
    expect(first?.getAttribute('src')).toBe(HERO_JPG);
    fireEvent.error(first!);

    const second = queryHeroCoverImg();
    expect(second).toBeTruthy();
    expect(second?.getAttribute('src')).toBe(HERO_B_JPG);
    expect(document.querySelector('.hero__cover-layer')).not.toBeNull();
  });

  test('all images fail — unmounts cover and reports unavailable', () => {
    const onCoverUnavailable = jest.fn();
    render(
      <HeroCoverImage
        headerImages={[HERO_JPG, HERO_B_JPG]}
        visualKey={VISUAL_KEY}
        onCoverUnavailable={onCoverUnavailable}
      />
    );

    fireEvent.error(queryHeroCoverImg()!);
    fireEvent.error(queryHeroCoverImg()!);

    expect(document.querySelector('.hero__cover-layer')).toBeNull();
    expect(onCoverUnavailable).toHaveBeenCalledTimes(1);
  });

  test('header images list changed — loads new sources after prior failure', async () => {
    const onCoverUnavailable = jest.fn();
    const { rerender } = render(
      <HeroCoverImage
        headerImages={[HERO_JPG]}
        visualKey={VISUAL_KEY}
        onCoverUnavailable={onCoverUnavailable}
      />
    );

    fireEvent.error(queryHeroCoverImg()!);
    expect(onCoverUnavailable).toHaveBeenCalledTimes(1);

    rerender(
      <HeroCoverImage
        headerImages={[HERO_B_JPG]}
        visualKey={VISUAL_KEY}
        onCoverUnavailable={onCoverUnavailable}
      />
    );

    await waitFor(() => {
      expect(queryHeroCoverImg()?.getAttribute('src')).toBe(HERO_B_JPG);
    });
    expect(document.querySelector('.hero__cover-layer')).not.toBeNull();
  });

  test('no valid header images — renders nothing', () => {
    const { container } = render(<HeroCoverImage headerImages={[]} visualKey={VISUAL_KEY} />);
    expect(container.firstChild).toBeNull();
  });

  test('equivalent proxy URL encoding does not return cover to pending after load', () => {
    const encoded = '/api/proxy-image?path=users%2Fu1%2Fhero%2Fcover-1920.jpg';
    const decoded = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';

    const { rerender } = render(<HeroCoverImage headerImages={[encoded]} visualKey={VISUAL_KEY} />);
    const img = queryHeroCoverImg()!;
    fireEvent.load(img);
    expect(img.classList.contains('hero__cover-image--pending')).toBe(false);

    rerender(<HeroCoverImage headerImages={[decoded]} visualKey={VISUAL_KEY} />);
    expect(queryHeroCoverImg()?.classList.contains('hero__cover-image--pending')).toBe(false);
  });

  test('visualKey change alone does not hide a loaded single-image cover', () => {
    const keyA = buildHeroVisualKey('/en', 'test-artist');
    const keyB = buildHeroVisualKey('/ru', 'test-artist');

    const { rerender } = render(<HeroCoverImage headerImages={[HERO_JPG]} visualKey={keyA} />);
    fireEvent.load(queryHeroCoverImg()!);

    rerender(<HeroCoverImage headerImages={[HERO_JPG]} visualKey={keyB} />);
    expect(queryHeroCoverImg()?.classList.contains('hero__cover-image--pending')).toBe(false);
  });
});
