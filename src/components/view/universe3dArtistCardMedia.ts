export const ARTIST_MEDIA_PLACEHOLDER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="universe3d-card__media-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>';

export type PopulateUniverse3dArtistCardMediaInput = {
  title: string;
  rawHeaderImages: string[];
  resolveUrl: (raw: string) => string;
  onImageLoaded?: () => void;
  shouldApplyCallbacks?: () => boolean;
};

export type Universe3dArtistCardMediaHandle = {
  /** Replace header image sources (e.g. after profile refresh) and retry from the first URL. */
  setHeaderImageSources: (rawHeaderImages: string[]) => void;
  dispose: () => void;
};

function normalizeHeaderImageList(raw: string[]): string[] {
  return raw.map((value) => String(value).trim()).filter(Boolean);
}

function clearArtistCardMediaContent(mediaEl: HTMLElement): void {
  mediaEl
    .querySelectorAll('.universe3d-card__media-image, .universe3d-card__media-placeholder')
    .forEach((node) => node.remove());
  mediaEl.classList.remove('universe3d-card__media--empty');
  if (mediaEl instanceof HTMLAnchorElement) {
    mediaEl.removeAttribute('aria-label');
  }
}

function appendArtistCardMediaPlaceholder(mediaEl: HTMLElement): void {
  if (mediaEl.querySelector('.universe3d-card__media-placeholder')) return;
  mediaEl.classList.add('universe3d-card__media--empty');
  const placeholder = document.createElement('div');
  placeholder.className = 'universe3d-card__media-placeholder';
  placeholder.innerHTML = ARTIST_MEDIA_PLACEHOLDER_ICON_SVG;
  mediaEl.appendChild(placeholder);
}

export function populateUniverse3dArtistCardMedia(
  mediaEl: HTMLElement,
  input: PopulateUniverse3dArtistCardMediaInput
): Universe3dArtistCardMediaHandle {
  let disposed = false;
  let activeImg: HTMLImageElement | null = null;
  let sources: string[] = [];
  let nextIndex = 0;

  const tryNextSource = () => {
    if (disposed) return;

    if (activeImg) {
      activeImg.removeEventListener('load', onLoad);
      activeImg.removeEventListener('error', onError);
      activeImg.remove();
      activeImg = null;
    }

    while (nextIndex < sources.length) {
      const resolved = input.resolveUrl(sources[nextIndex] ?? '');
      nextIndex += 1;
      if (!resolved) continue;

      const img = document.createElement('img');
      img.className = 'universe3d-card__media-image';
      img.alt = input.title;
      img.loading = 'eager';
      img.decoding = 'async';
      img.src = resolved;
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
      mediaEl.appendChild(img);
      activeImg = img;
      return;
    }

    appendArtistCardMediaPlaceholder(mediaEl);
    if (mediaEl instanceof HTMLAnchorElement) {
      mediaEl.setAttribute('aria-label', input.title);
    }
  };

  const onLoad = () => {
    if (disposed) return;
    if (input.shouldApplyCallbacks && !input.shouldApplyCallbacks()) return;
    input.onImageLoaded?.();
  };

  const onError = () => {
    if (disposed) return;
    tryNextSource();
  };

  const startWithSources = (rawHeaderImages: string[]) => {
    clearArtistCardMediaContent(mediaEl);
    sources = normalizeHeaderImageList(rawHeaderImages);
    nextIndex = 0;
    if (sources.length === 0) {
      appendArtistCardMediaPlaceholder(mediaEl);
      if (mediaEl instanceof HTMLAnchorElement) {
        mediaEl.setAttribute('aria-label', input.title);
      }
      return;
    }
    tryNextSource();
  };

  startWithSources(input.rawHeaderImages);

  return {
    setHeaderImageSources: (rawHeaderImages: string[]) => {
      if (disposed) return;
      startWithSources(rawHeaderImages);
    },
    dispose: () => {
      disposed = true;
      if (activeImg) {
        activeImg.removeEventListener('load', onLoad);
        activeImg.removeEventListener('error', onError);
      }
      activeImg = null;
    },
  };
}
