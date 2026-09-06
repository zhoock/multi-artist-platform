import { stripLangPrefix } from '@shared/lib/i18n/routeLang';
import { normalizeProxyImageUrl } from '@shared/lib/proxyImageUrl';
import { getCachedPublicArtistHeaderImages } from '@shared/lib/publicArtistsCache';
import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';

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

/** Matches HeroCoverImage sizes — derived from existing Hero CSS geometry. */
export const HERO_COVER_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 37vw, 100vw';

export const HERO_COVER_VARIANT_WIDTHS = [896, 1280, 1920] as const;
export type HeroCoverVariantWidth = (typeof HERO_COVER_VARIANT_WIDTHS)[number];

export type HeroCoverSources = {
  /** Largest JPG for <img src> fallback. */
  jpg: string;
  avifSrcSet: string | null;
  webpSrcSet: string | null;
  jpgSrcSet: string;
  sizes: string;
  /** Largest AVIF/WebP URLs — effect deps / legacy callers. */
  avif: string | null;
  webp: string | null;
};

function stripCssUrlWrapper(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("url('") || trimmed.startsWith('url("')) {
    const match = trimmed.match(/url\(["']([^"']+)["']\)/);
    return match?.[1]?.trim() ?? trimmed;
  }
  return trimmed;
}

function extractHeroVariantPrefix(base: string): string | null {
  if (!base) return null;

  const sizedMatch = base.match(/^(.*)-(896|1280|1920)\.(avif|webp|jpe?g)$/i);
  if (sizedMatch) {
    return sizedMatch[1];
  }

  const extMatch = base.match(/^(.*)\.(avif|webp|jpe?g)$/i);
  if (extMatch) {
    return extMatch[1];
  }

  return base;
}

function heroVariantExtension(targetExt: 'avif' | 'webp' | 'jpg'): string {
  return targetExt === 'jpg' ? 'jpg' : targetExt;
}

/** Resolve a hero storage/proxy URL for a specific width + format. */
export function deriveHeroVariantUrl(
  url: string,
  targetExt: 'avif' | 'webp' | 'jpg',
  width: HeroCoverVariantWidth = 1920
): string | null {
  const base = stripCssUrlWrapper(url);
  if (!base) return null;

  const prefix = extractHeroVariantPrefix(base);
  if (!prefix) return null;

  const sizedMatch = base.match(/^(.*)-(896|1280|1920)\.(avif|webp|jpe?g)$/i);
  if (sizedMatch) {
    return normalizeProxyImageUrl(`${prefix}-${width}.${heroVariantExtension(targetExt)}`);
  }

  const extMatch = base.match(/^(.*)\.(avif|webp|jpe?g)$/i);
  if (!extMatch) {
    return targetExt === 'jpg' ? base : null;
  }

  if (targetExt === 'jpg') return normalizeProxyImageUrl(`${prefix}.jpg`);
  return normalizeProxyImageUrl(`${prefix}.${targetExt}`);
}

function buildHeroSrcSet(canonicalJpg: string, targetExt: 'avif' | 'webp' | 'jpg'): string | null {
  const base = stripCssUrlWrapper(canonicalJpg);
  const prefix = extractHeroVariantPrefix(base);
  if (!prefix) return null;

  const hasSizedSuffix = /-(896|1280|1920)\.(avif|webp|jpe?g)$/i.test(base);
  if (!hasSizedSuffix) {
    const single = deriveHeroVariantUrl(canonicalJpg, targetExt);
    return single ? `${single} 1920w` : null;
  }

  return HERO_COVER_VARIANT_WIDTHS.map((width) => {
    const url = deriveHeroVariantUrl(canonicalJpg, targetExt, width);
    return url ? `${url} ${width}w` : null;
  })
    .filter((entry): entry is string => Boolean(entry))
    .join(', ');
}

function buildHeroCoverSources(canonicalJpg: string): HeroCoverSources {
  const jpg = normalizeProxyImageUrl(stripCssUrlWrapper(canonicalJpg));
  const avifSrcSet = buildHeroSrcSet(jpg, 'avif');
  const webpSrcSet = buildHeroSrcSet(jpg, 'webp');
  const jpgSrcSet = buildHeroSrcSet(jpg, 'jpg') ?? `${jpg} 1920w`;

  return {
    jpg,
    avifSrcSet,
    webpSrcSet,
    jpgSrcSet,
    sizes: HERO_COVER_SIZES,
    avif: deriveHeroVariantUrl(jpg, 'avif', 1920),
    webp: deriveHeroVariantUrl(jpg, 'webp', 1920),
  };
}

function parseImageSetHeroSources(rawUrl: string): HeroCoverSources | null {
  const avifMatch = rawUrl.match(/url\(["']([^"']+\.avif[^"']*)["']\)/i);
  const webpMatch = rawUrl.match(/url\(["']([^"']+\.webp[^"']*)["']\)/i);
  const jpgMatch = rawUrl.match(/url\(["']([^"']+\.jpe?g[^"']*)["']\)/i);

  const jpg = jpgMatch?.[1] ? normalizeProxyImageUrl(jpgMatch[1]) : null;
  if (!jpg) return null;

  return buildHeroCoverSources(jpg);
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

  return buildHeroCoverSources(jpg);
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

/** CSS slot width implied by HERO_COVER_SIZES for a viewport. */
export function resolveHeroCoverSlotWidth(viewportWidth: number): number {
  if (viewportWidth >= 1024) return viewportWidth * 0.25;
  if (viewportWidth >= 768) return viewportWidth * 0.37;
  return viewportWidth;
}

/** Pick the smallest hero variant width that covers slot × DPR. */
export function resolveHeroCoverVariantWidth(
  viewportWidth: number,
  devicePixelRatio = 1
): HeroCoverVariantWidth {
  const needed = resolveHeroCoverSlotWidth(viewportWidth) * devicePixelRatio;
  for (const width of HERO_COVER_VARIANT_WIDTHS) {
    if (width >= needed) {
      return width;
    }
  }
  return 1920;
}

export function resolveHeroCoverViewportMetrics(): {
  viewportWidth: number;
  devicePixelRatio: number;
} {
  if (typeof window === 'undefined') {
    return { viewportWidth: 1920, devicePixelRatio: 1 };
  }
  return {
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/** @deprecated Prefer pickHeroCoverSources + <picture>. Kept for legacy CSS background callers. */
export function pickHeroBackgroundImage(headerImages: string[], visualSeed: string): string {
  const sources = pickHeroCoverSources(headerImages, visualSeed);
  if (!sources) return '';
  return `url('${sources.jpg}')`;
}

const headerImagesCache = new Map<string, string[]>();
const headerImagesInflight = new Map<string, Promise<string[]>>();
/** slug → primary preload href (avif, else webp, else jpg) */
const preloadedHeroCoverBySlug = new Map<string, string>();

const HERO_COVER_PRELOAD_ATTR = 'data-hero-cover-preload';

/** Same visual seed as Hero — keeps cover pick stable for preload vs <img>. */
export function buildHeroVisualKey(pathname: string, artistSlug: string): string {
  return `${stripLangPrefix(pathname)}|${artistSlug.trim().toLowerCase()}`;
}

function readHeroVisualKeyForPreload(artistSlug: string): string {
  if (typeof window === 'undefined') {
    return buildHeroVisualKey('/', artistSlug);
  }
  return buildHeroVisualKey(window.location.pathname, artistSlug);
}

function clearHeroCoverPreloadLinks(artistSlug?: string): void {
  if (typeof document === 'undefined') return;
  const selector = artistSlug?.trim()
    ? `link[${HERO_COVER_PRELOAD_ATTR}="${artistSlug.trim().toLowerCase()}"]`
    : `link[${HERO_COVER_PRELOAD_ATTR}]`;
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

function appendHeroCoverPreloadLink(href: string, type: string, artistSlug: string): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  link.type = type;
  link.setAttribute(HERO_COVER_PRELOAD_ATTR, artistSlug);
  link.setAttribute('fetchpriority', 'high');
  if ('fetchPriority' in link) {
    link.fetchPriority = 'high';
  }
  document.head.appendChild(link);
}

/**
 * Same selection order as HeroCoverImage <picture>: AVIF → WebP → JPG,
 * at the variant width the browser would pick for the current viewport.
 */
export function resolveHeroCoverPreloadTarget(
  sources: HeroCoverSources,
  viewportWidth?: number,
  devicePixelRatio?: number
): { href: string; type: string } | null {
  if (!sources.jpg) return null;

  const metrics =
    viewportWidth != null
      ? { viewportWidth, devicePixelRatio: devicePixelRatio ?? 1 }
      : resolveHeroCoverViewportMetrics();
  const variantWidth = resolveHeroCoverVariantWidth(
    metrics.viewportWidth,
    metrics.devicePixelRatio
  );

  const avif = deriveHeroVariantUrl(sources.jpg, 'avif', variantWidth);
  if (avif) {
    return { href: avif, type: 'image/avif' };
  }

  const webp = deriveHeroVariantUrl(sources.jpg, 'webp', variantWidth);
  if (webp) {
    return { href: webp, type: 'image/webp' };
  }

  const jpg = deriveHeroVariantUrl(sources.jpg, 'jpg', variantWidth);
  if (jpg) {
    return { href: jpg, type: 'image/jpeg' };
  }

  return null;
}

/**
 * Native preload for the single format the browser will pick from <picture>.
 * One typed <link rel="preload"> avoids duplicate AVIF+WebP or JPG+AVIF fetches.
 */
export function preloadHeroCoverSources(sources: HeroCoverSources, artistSlug: string): void {
  if (typeof document === 'undefined') return;

  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return;

  const target = resolveHeroCoverPreloadTarget(sources);
  if (!target) return;

  if (preloadedHeroCoverBySlug.get(slug) === target.href) return;

  clearHeroCoverPreloadLinks(slug);
  preloadedHeroCoverBySlug.set(slug, target.href);
  appendHeroCoverPreloadLink(target.href, target.type, slug);
}

/**
 * Start Hero LCP image fetch as soon as headerImages are known — before React mounts <img>.
 * Uses typed <link rel="preload"> so the browser picks the same format as <picture>.
 */
export function preloadHeroCoverFromHeaderImages(
  artistSlug: string,
  headerImages: string[],
  visualSeed?: string
): void {
  if (typeof document === 'undefined') return;

  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return;

  const valid = filterValidHeroHeaderImages(headerImages);
  if (valid.length === 0) return;

  const seed = visualSeed ?? readHeroVisualKeyForPreload(slug);
  const sources = pickHeroCoverSources(valid, seed);
  if (!sources) return;

  preloadHeroCoverSources(sources, slug);
}

function tryPreloadHeroCoverImages(artistSlug: string, headerImages: string[]): void {
  preloadHeroCoverFromHeaderImages(artistSlug, headerImages);
}

/** Sync read after loader prefetch or prior fetch — `null` when slug not resolved yet. */
export function getCachedArtistHeroHeaderImages(artistSlug: string): string[] | null {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug || !headerImagesCache.has(slug)) {
    return null;
  }
  return headerImagesCache.get(slug)!;
}

/**
 * @deprecated Header inflight is owned by fetchPublicArtistUserProfile.
 * Kept for compatibility with existing imports/tests.
 */
export function syncHeaderImagesInflightFromProfileFetch(
  artistSlug: string,
  profileNetworkPromise: Promise<unknown>
): void {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug || headerImagesCache.has(slug) || headerImagesInflight.has(slug)) {
    return;
  }

  const headerPromise = profileNetworkPromise
    .then(() => headerImagesCache.get(slug) ?? [])
    .catch(() => {
      headerImagesInflight.delete(slug);
      if (!headerImagesCache.has(slug)) {
        headerImagesCache.set(slug, []);
      }
      return headerImagesCache.get(slug)!;
    });

  headerImagesInflight.set(slug, headerPromise);
}

export async function fetchArtistHeroHeaderImages(
  artistSlug: string,
  lang?: string
): Promise<string[]> {
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

  const promise = fetchPublicArtistUserProfile(slug, { lang })
    .then((profile) => {
      if (profile) {
        return filterValidHeroHeaderImages(profile.headerImages ?? []);
      }
      const fromPublic = getCachedPublicArtistHeaderImages(slug);
      return filterValidHeroHeaderImages(fromPublic ?? []);
    })
    .then((images) => {
      setCachedArtistHeroHeaderImages(slug, images);
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

export function invalidateArtistHeroHeaderImagesCache(artistSlug?: string): void {
  if (!artistSlug?.trim()) {
    headerImagesCache.clear();
    headerImagesInflight.clear();
    preloadedHeroCoverBySlug.clear();
    clearHeroCoverPreloadLinks();
    return;
  }

  const slug = artistSlug.trim().toLowerCase();
  headerImagesCache.delete(slug);
  headerImagesInflight.delete(slug);
  preloadedHeroCoverBySlug.delete(slug);
  clearHeroCoverPreloadLinks(slug);
}

export function setCachedArtistHeroHeaderImages(artistSlug: string, images: string[]): void {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return;
  const valid = filterValidHeroHeaderImages(images);
  headerImagesCache.set(slug, valid);
  headerImagesInflight.delete(slug);
  tryPreloadHeroCoverImages(slug, valid);
}
