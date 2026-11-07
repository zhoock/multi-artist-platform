import { stripLangPrefix } from '@shared/lib/i18n/routeLang';
import {
  buildProxyImageUrlFromStoragePath,
  extractStoragePathFromProxyInput,
  normalizeProxyImageUrl,
} from '@shared/lib/proxyImageUrl';
import { getCachedPublicArtistHeaderImages } from '@shared/lib/publicArtistsCache';
import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';

const CANONICAL_HERO_JPG_FILE = /-1920\.jpe?g$/i;

export function filterValidHeroHeaderImages(images: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of images || []) {
    const canonical = normalizeCanonicalHeroHeaderImageUrl(String(raw));
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/** Matches HeroCoverImage sizes — derived from existing Hero CSS geometry. */
export const HERO_COVER_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 37vw, 100vw';

/**
 * Logical hero image widths in Storage (`{baseName}-{width}.{webp|jpg}`).
 * Must match `netlify/functions/lib/hero-variants.ts` / `generateHeroImageVariants`.
 */
export const HERO_COVER_VARIANT_WIDTHS = [896, 1280, 1920] as const;
export type HeroCoverVariantWidth = (typeof HERO_COVER_VARIANT_WIDTHS)[number];

export type HeroCoverSources = {
  /** Largest JPG for <img src> fallback. */
  jpg: string;
  webpSrcSet: string | null;
  jpgSrcSet: string;
  sizes: string;
  /** Largest WebP URL for effect deps. */
  webp: string | null;
};

export type HeroVariantOutputFormat = 'webp' | 'jpg';

function stripCssUrlWrapper(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("url('") || trimmed.startsWith('url("')) {
    const match = trimmed.match(/url\(["']([^"']+)["']\)/);
    return match?.[1]?.trim() ?? trimmed;
  }
  return trimmed;
}

/** Bucket-relative `users/.../hero/...` when present in proxy URL, storage path, or absolute URL. */
export function resolveHeroStoragePath(input: string): string | null {
  const trimmed = stripCssUrlWrapper(input.trim());
  if (!trimmed) return null;

  const fromProxy = extractStoragePathFromProxyInput(trimmed);
  if (fromProxy?.includes('/hero/')) return fromProxy;

  if (trimmed.startsWith('users/') && trimmed.includes('/hero/')) {
    return trimmed.split('?')[0] ?? trimmed;
  }

  const match = trimmed.match(/(users\/[^/]+\/hero\/[^?#]+)/i);
  return match?.[1] ?? null;
}

/**
 * Canonical hero pointer for display/preload: proxy URL to `users/.../hero/*-1920.jpg`.
 */
export function normalizeCanonicalHeroHeaderImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('image-set') || /\.avif/i.test(trimmed)) {
    return null;
  }

  const storagePath = resolveHeroStoragePath(trimmed);
  if (!storagePath?.includes('/hero/')) {
    return null;
  }

  const fileName = storagePath.split('/').pop() ?? '';
  if (!CANONICAL_HERO_JPG_FILE.test(fileName)) {
    return null;
  }

  if (
    trimmed.includes('proxy-image') &&
    extractStoragePathFromProxyInput(trimmed) === storagePath
  ) {
    return normalizeProxyImageUrl(trimmed);
  }

  if (trimmed.startsWith('users/')) {
    return buildProxyImageUrlFromStoragePath(storagePath);
  }

  return buildProxyImageUrlFromStoragePath(storagePath);
}

function heroProxyUrlForStoragePath(canonicalJpgProxy: string, variantStoragePath: string): string {
  const pathParam =
    canonicalJpgProxy.includes('%2F') || canonicalJpgProxy.includes('%2f')
      ? encodeURIComponent(variantStoragePath)
      : variantStoragePath;
  if (canonicalJpgProxy.includes('/api/proxy-image')) {
    return `/api/proxy-image?path=${pathParam}`;
  }
  if (canonicalJpgProxy.includes('proxy-image')) {
    return canonicalJpgProxy.replace(/([?&]path=)[^&]+/, `$1${pathParam}`);
  }
  return buildProxyImageUrlFromStoragePath(variantStoragePath);
}

/** Resolve a hero storage/proxy URL for a specific width + format. */
export function deriveHeroVariantUrl(
  url: string,
  targetExt: HeroVariantOutputFormat,
  width: HeroCoverVariantWidth = 1920
): string | null {
  const canonical = normalizeCanonicalHeroHeaderImageUrl(url);
  if (!canonical) return null;

  const storagePath = resolveHeroStoragePath(canonical);
  if (!storagePath?.includes('/hero/')) return null;

  const segments = storagePath.split('/');
  const fileName = segments.pop() ?? '';
  const dir = segments.join('/');

  const sizedMatch = fileName.match(/^(.*)-(896|1280|1920)\.(webp|jpe?g)$/i);
  const extMatch = fileName.match(/^(.*)\.(webp|jpe?g)$/i);
  const prefix = sizedMatch?.[1] ?? extMatch?.[1];
  if (!prefix) return null;

  const ext = targetExt === 'jpg' ? 'jpg' : 'webp';
  return heroProxyUrlForStoragePath(canonical, `${dir}/${prefix}-${width}.${ext}`);
}

function buildHeroSrcSet(canonicalJpg: string, targetExt: HeroVariantOutputFormat): string | null {
  return HERO_COVER_VARIANT_WIDTHS.map((width) => {
    const variantUrl = deriveHeroVariantUrl(canonicalJpg, targetExt, width);
    return variantUrl ? `${variantUrl} ${width}w` : null;
  })
    .filter((entry): entry is string => Boolean(entry))
    .join(', ');
}

function buildHeroCoverSources(canonicalJpg: string): HeroCoverSources {
  const jpg = normalizeCanonicalHeroHeaderImageUrl(canonicalJpg) ?? canonicalJpg;
  const webpSrcSet = buildHeroSrcSet(jpg, 'webp');
  const jpgSrcSet = buildHeroSrcSet(jpg, 'jpg') || `${jpg} 1920w`;

  return {
    jpg,
    webpSrcSet,
    jpgSrcSet,
    sizes: HERO_COVER_SIZES,
    webp: deriveHeroVariantUrl(jpg, 'webp', 1920),
  };
}

/** Build WebP + JPEG `<picture>` sources from a canonical `-1920.jpg` URL. */
export function resolveHeroCoverSourcesFromUrl(rawUrl: string): HeroCoverSources | null {
  const canonical = normalizeCanonicalHeroHeaderImageUrl(rawUrl);
  if (!canonical) return null;
  return buildHeroCoverSources(canonical);
}

/**
 * Slug part of `buildHeroVisualKey(pathname, slug)` — used so preload (may use
 * `window.location.pathname`) and Hero (`heroPathname` incl. overlay) share one pick per artist.
 */
function heroCoverPickIdentityKey(visualKey: string): string {
  const pipe = visualKey.lastIndexOf('|');
  const raw = pipe >= 0 ? visualKey.slice(pipe + 1) : visualKey;
  return raw.trim().toLowerCase();
}

/** Sorted canonical URL fingerprint — same set ⇒ same string (encoding-normalized). */
export function heroHeaderImagesSignature(headerImages: string[]): string {
  const valid = filterValidHeroHeaderImages(headerImages);
  if (valid.length === 0) return '';
  return [...valid].sort().join('\n');
}

/** Ordered storage paths for the current cover fallback list (primary + rest). */
export function heroCoverFallbackStorageSignature(
  headerImages: string[],
  visualKey: string
): string {
  const urls = buildHeroCoverFallbackUrls(headerImages, visualKey);
  if (urls.length === 0) return '';
  return urls
    .map((url) => resolveHeroStoragePath(url) ?? url.trim())
    .filter(Boolean)
    .join('\0');
}

type HeroCoverPickEntry = { sig: string; index: number };

/**
 * In-memory only — clears on full page reload, stable during SPA navigation and re-renders.
 * Keyed by artist slug + signature of current `headerImages`.
 */
const heroCoverPickByArtist = new Map<string, HeroCoverPickEntry>();

/** @internal Test hook */
export function resetHeroCoverPickCacheForTests(): void {
  heroCoverPickByArtist.clear();
}

function pickHeroHeaderImageUrl(headerImages: string[], visualKey: string): string {
  if (headerImages.length === 0) return '';
  if (headerImages.length === 1) {
    return headerImages[0] ?? '';
  }

  const cacheKey = heroCoverPickIdentityKey(visualKey);
  const sig = heroHeaderImagesSignature(headerImages);
  const existing = heroCoverPickByArtist.get(cacheKey);
  if (existing && existing.sig === sig) {
    return headerImages[existing.index % headerImages.length] ?? '';
  }

  const index = Math.floor(Math.random() * headerImages.length);
  heroCoverPickByArtist.set(cacheKey, { sig, index });
  return headerImages[index] ?? '';
}

/**
 * Picks one stored hero (multiple URLs) once per full page load; same choice until the tab reloads
 * or the set of hero image URLs changes. Preload and `<picture>` both use this via `visualKey`.
 */
export function pickHeroCoverSources(
  headerImages: string[],
  visualSeed: string
): HeroCoverSources | null {
  if (headerImages.length === 0) return null;
  return resolveHeroCoverSourcesFromUrl(pickHeroHeaderImageUrl(headerImages, visualSeed));
}

/**
 * Ordered hero URLs to try in `<picture>`: primary pick (preload-aligned) first, then the rest.
 * Used when the primary image fails to load (e.g. removed from Storage).
 */
export function buildHeroCoverFallbackUrls(headerImages: string[], visualKey: string): string[] {
  const valid = filterValidHeroHeaderImages(headerImages);
  if (valid.length === 0) return [];
  const primary = pickHeroHeaderImageUrl(valid, visualKey);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };
  push(primary);
  for (const url of valid) push(url);
  return ordered;
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
/** slug → primary preload href (webp, else jpg) */
const preloadedHeroCoverBySlug = new Map<string, string>();

const HERO_COVER_PRELOAD_ATTR = 'data-hero-cover-preload';

/** Same `visualKey` string as Hero — slug is used to share one cover pick between preload and `<picture>`. */
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
 * Same selection order as HeroCoverImage <picture>: WebP → JPG,
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
 * One typed <link rel="preload"> aligned with `<picture>` (WebP preferred, else JPEG).
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
    heroCoverPickByArtist.clear();
    clearHeroCoverPreloadLinks();
    return;
  }

  const slug = artistSlug.trim().toLowerCase();
  headerImagesCache.delete(slug);
  headerImagesInflight.delete(slug);
  preloadedHeroCoverBySlug.delete(slug);
  heroCoverPickByArtist.delete(slug);
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
