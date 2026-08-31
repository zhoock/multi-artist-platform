import { normalizeProxyImageUrl } from '@shared/api/storage';
import { loadHeaderImagesFromDatabase } from '@entities/user/lib';

export function filterValidHeroHeaderImages(images: string[] | null | undefined): string[] {
  return (images || []).filter((url) => {
    return (
      url.includes('/hero/') ||
      url.includes('/hero-') ||
      (url.includes('proxy-image') && url.includes('hero')) ||
      (url.includes('users/') && url.includes('/hero/'))
    );
  });
}

export type HeroCoverSources = {
  avif: string | null;
  webp: string | null;
  jpg: string;
};

function stripCssUrlWrapper(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("url('") || trimmed.startsWith('url("')) {
    const match = trimmed.match(/url\(["']([^"']+)["']\)/);
    return match?.[1]?.trim() ?? trimmed;
  }
  return trimmed;
}

function deriveHeroVariantUrl(url: string, targetExt: 'avif' | 'webp' | 'jpg'): string | null {
  const base = stripCssUrlWrapper(url);
  if (!base) return null;

  const sizedMatch = base.match(/^(.*)-1920\.(avif|webp|jpe?g)$/i);
  if (sizedMatch) {
    const prefix = sizedMatch[1];
    if (targetExt === 'jpg') return `${prefix}-1920.jpg`;
    return `${prefix}-1920.${targetExt}`;
  }

  const extMatch = base.match(/^(.*)\.(avif|webp|jpe?g)$/i);
  if (!extMatch) {
    return targetExt === 'jpg' ? base : null;
  }

  const prefix = extMatch[1];
  if (targetExt === 'jpg') return `${prefix}.jpg`;
  return `${prefix}.${targetExt}`;
}

function parseImageSetHeroSources(rawUrl: string): HeroCoverSources | null {
  const avifMatch = rawUrl.match(/url\(["']([^"']+\.avif[^"']*)["']\)/i);
  const webpMatch = rawUrl.match(/url\(["']([^"']+\.webp[^"']*)["']\)/i);
  const jpgMatch = rawUrl.match(/url\(["']([^"']+\.jpe?g[^"']*)["']\)/i);

  const jpg = jpgMatch?.[1] ? normalizeProxyImageUrl(jpgMatch[1]) : null;
  if (!jpg) return null;

  return {
    avif: avifMatch?.[1] ? normalizeProxyImageUrl(avifMatch[1]) : deriveHeroVariantUrl(jpg, 'avif'),
    webp: webpMatch?.[1] ? normalizeProxyImageUrl(webpMatch[1]) : deriveHeroVariantUrl(jpg, 'webp'),
    jpg,
  };
}

/** Resolve AVIF → WebP → JPG sources for a single stored hero URL. */
export function resolveHeroCoverSourcesFromUrl(rawUrl: string): HeroCoverSources | null {
  if (!rawUrl?.trim()) return null;

  if (rawUrl.includes('image-set')) {
    return parseImageSetHeroSources(rawUrl);
  }

  const normalized = normalizeProxyImageUrl(stripCssUrlWrapper(rawUrl));
  if (!normalized) return null;

  const jpg = deriveHeroVariantUrl(normalized, 'jpg');
  if (!jpg) return null;

  return {
    avif: deriveHeroVariantUrl(normalized, 'avif'),
    webp: deriveHeroVariantUrl(normalized, 'webp'),
    jpg,
  };
}

function pickHeroHeaderImageUrl(headerImages: string[], visualSeed: string): string {
  let hash = 0;
  for (let i = 0; i < visualSeed.length; i++) {
    hash = (hash * 31 + visualSeed.charCodeAt(i)) >>> 0;
  }
  return headerImages[hash % headerImages.length] ?? '';
}

/** Stable pick per visual context — same slug/path always maps to the same cover on first paint. */
export function pickHeroCoverSources(
  headerImages: string[],
  visualSeed: string
): HeroCoverSources | null {
  if (headerImages.length === 0) return null;
  return resolveHeroCoverSourcesFromUrl(pickHeroHeaderImageUrl(headerImages, visualSeed));
}

/** @deprecated Prefer pickHeroCoverSources + <picture>. Kept for legacy CSS background callers. */
export function pickHeroBackgroundImage(headerImages: string[], visualSeed: string): string {
  const sources = pickHeroCoverSources(headerImages, visualSeed);
  if (!sources) return '';
  return `url('${sources.jpg}')`;
}

const headerImagesCache = new Map<string, string[]>();
const headerImagesInflight = new Map<string, Promise<string[]>>();

export function invalidateArtistHeroHeaderImagesCache(artistSlug?: string): void {
  if (!artistSlug?.trim()) {
    headerImagesCache.clear();
    headerImagesInflight.clear();
    return;
  }

  const slug = artistSlug.trim().toLowerCase();
  headerImagesCache.delete(slug);
  headerImagesInflight.delete(slug);
}

export async function fetchArtistHeroHeaderImages(artistSlug: string): Promise<string[]> {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) {
    return [];
  }

  if (headerImagesCache.has(slug)) {
    return headerImagesCache.get(slug)!;
  }

  const inflight = headerImagesInflight.get(slug);
  if (inflight) {
    return inflight;
  }

  const promise = loadHeaderImagesFromDatabase(false, { artistSlugOverride: slug })
    .then((images) => filterValidHeroHeaderImages(images))
    .then((images) => {
      headerImagesCache.set(slug, images);
      headerImagesInflight.delete(slug);
      return images;
    })
    .catch(() => {
      headerImagesInflight.delete(slug);
      headerImagesCache.set(slug, []);
      return [];
    });

  headerImagesInflight.set(slug, promise);
  return promise;
}

export function setCachedArtistHeroHeaderImages(artistSlug: string, images: string[]): void {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return;
  headerImagesCache.set(slug, filterValidHeroHeaderImages(images));
  headerImagesInflight.delete(slug);
}
