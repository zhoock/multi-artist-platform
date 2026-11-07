import {
  populateUniverse3dArtistCardMedia,
  type Universe3dArtistCardMediaHandle,
} from '../universe3dArtistCardMedia';

const identityResolve = (raw: string) => raw;

function createMediaEl(): HTMLAnchorElement {
  const el = document.createElement('a');
  el.className = 'universe3d-card__media';
  return el;
}

function triggerImageError(img: HTMLImageElement): void {
  img.dispatchEvent(new Event('error'));
}

function triggerImageLoad(img: HTMLImageElement): void {
  img.dispatchEvent(new Event('load'));
}

function finishPlaceholderFade(mediaEl: HTMLElement): void {
  const placeholder = mediaEl.querySelector('.universe3d-card__media-placeholder');
  placeholder?.dispatchEvent(new Event('transitionend'));
}

function mountMedia(
  rawHeaderImages: string[],
  extra?: Partial<Parameters<typeof populateUniverse3dArtistCardMedia>[1]>
): { mediaEl: HTMLAnchorElement; handle: Universe3dArtistCardMediaHandle } {
  const mediaEl = createMediaEl();
  const handle = populateUniverse3dArtistCardMedia(mediaEl, {
    title: 'Test Artist',
    rawHeaderImages,
    resolveUrl: identityResolve,
    ...extra,
  });
  return { mediaEl, handle };
}

describe('populateUniverse3dArtistCardMedia', () => {
  test('artist without photos — standard placeholder', () => {
    const { mediaEl } = mountMedia([]);
    expect(mediaEl.querySelector('.universe3d-card__media-image')).toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(true);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
    expect(mediaEl.getAttribute('aria-label')).toBe('Test Artist');
  });

  test('shows placeholder immediately when header URLs are present (before load completes)', () => {
    const { mediaEl } = mountMedia(['https://cdn.example/hero.jpg']);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(true);

    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.classList.contains('universe3d-card__media-image--pending')).toBe(true);
    expect(img.classList.contains('universe3d-card__media-image--loaded')).toBe(false);
  });

  test('successful load — reveals image and removes placeholder', () => {
    const onImageLoaded = jest.fn();
    const { mediaEl } = mountMedia(['https://cdn.example/hero.jpg'], { onImageLoaded });

    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageLoad(img);
    finishPlaceholderFade(mediaEl);

    expect(img.classList.contains('universe3d-card__media-image--loaded')).toBe(true);
    expect(img.classList.contains('universe3d-card__media-image--pending')).toBe(false);
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).toBeNull();
    expect(onImageLoaded).toHaveBeenCalledTimes(1);
  });

  test('slow load — placeholder stays visible until load', () => {
    const { mediaEl } = mountMedia(['https://cdn.example/slow.jpg']);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(true);

    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(img.classList.contains('universe3d-card__media-image--pending')).toBe(true);

    triggerImageLoad(img);
    finishPlaceholderFade(mediaEl);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).toBeNull();
    expect(img.classList.contains('universe3d-card__media-image--loaded')).toBe(true);
  });

  test('unavailable image (404) — placeholder remains', () => {
    const { mediaEl } = mountMedia(['https://cdn.example/missing.jpg']);
    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;

    triggerImageError(img);

    expect(mediaEl.querySelector('.universe3d-card__media-image')).toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(true);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
  });

  test('multiple images — first fails, second is used', () => {
    const { mediaEl } = mountMedia([
      'https://cdn.example/missing.jpg',
      'https://cdn.example/ok.jpg',
    ]);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();

    const first = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(first.src).toContain('missing.jpg');
    triggerImageError(first);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();

    const second = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(second).not.toBeNull();
    expect(second.src).toContain('ok.jpg');
    expect(second.classList.contains('universe3d-card__media-image--pending')).toBe(true);

    triggerImageLoad(second);
    finishPlaceholderFade(mediaEl);

    expect(second.classList.contains('universe3d-card__media-image--loaded')).toBe(true);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);
  });

  test('all images unavailable — placeholder stays', () => {
    const { mediaEl } = mountMedia([
      'https://cdn.example/a-missing.jpg',
      'https://cdn.example/b-missing.jpg',
    ]);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();

    let img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(img);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();

    img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(img);

    expect(mediaEl.querySelector('.universe3d-card__media-image')).toBeNull();
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(true);
  });

  test('does not retry the same failed URL in a loop', () => {
    const resolveUrl = jest.fn(identityResolve);
    const { mediaEl } = mountMedia(['https://cdn.example/only-bad.jpg'], { resolveUrl });

    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(img);

    expect(resolveUrl).toHaveBeenCalledTimes(1);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
  });

  test('source changed after error — new image renders', () => {
    const { mediaEl, handle } = mountMedia(['https://cdn.example/bad.jpg']);
    const bad = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(bad);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();

    handle.setHeaderImageSources(['https://cdn.example/fresh.jpg']);

    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
    const good = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(good).not.toBeNull();
    expect(good.src).toContain('fresh.jpg');

    triggerImageLoad(good);
    finishPlaceholderFade(mediaEl);

    expect(good.classList.contains('universe3d-card__media-image--loaded')).toBe(true);
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);
  });
});
