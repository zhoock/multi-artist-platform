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

  test('successful load — shows image', () => {
    const onImageLoaded = jest.fn();
    const { mediaEl } = mountMedia(['https://cdn.example/hero.jpg'], { onImageLoaded });

    const img = mediaEl.querySelector('.universe3d-card__media-image');
    expect(img).not.toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);

    triggerImageLoad(img as HTMLImageElement);
    expect(onImageLoaded).toHaveBeenCalledTimes(1);
  });

  test('unavailable image (404) — placeholder', () => {
    const { mediaEl } = mountMedia(['https://cdn.example/missing.jpg']);
    const img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(img).not.toBeNull();

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

    const first = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(first.src).toContain('missing.jpg');

    triggerImageError(first);

    const second = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(second).not.toBeNull();
    expect(second.src).toContain('ok.jpg');
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);
  });

  test('all images unavailable — placeholder', () => {
    const { mediaEl } = mountMedia([
      'https://cdn.example/a-missing.jpg',
      'https://cdn.example/b-missing.jpg',
    ]);

    let img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(img);

    img = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    triggerImageError(img);

    expect(mediaEl.querySelector('.universe3d-card__media-image')).toBeNull();
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).not.toBeNull();
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

    const good = mediaEl.querySelector('.universe3d-card__media-image') as HTMLImageElement;
    expect(good).not.toBeNull();
    expect(good.src).toContain('fresh.jpg');
    expect(mediaEl.querySelector('.universe3d-card__media-placeholder')).toBeNull();
    expect(mediaEl.classList.contains('universe3d-card__media--empty')).toBe(false);
  });
});
