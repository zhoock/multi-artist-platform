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

function formatBackgroundImageUrl(imageUrl: string): string {
  if (!imageUrl || !imageUrl.trim()) {
    return '';
  }

  if (imageUrl.startsWith("url('") || imageUrl.startsWith('url("')) {
    return imageUrl;
  }

  if (imageUrl.includes('image-set')) {
    const jpgMatch = imageUrl.match(/url\(["']([^"']+\.jpg[^"']*)["']\)/);
    if (jpgMatch?.[1]) {
      return `url('${jpgMatch[1]}')`;
    }
    const webpMatch = imageUrl.match(/url\(["']([^"']+\.webp[^"']*)["']\)/);
    if (webpMatch?.[1]) {
      return `url('${webpMatch[1]}')`;
    }
    const firstMatch = imageUrl.match(/url\(["']([^"']+)["']\)/);
    if (firstMatch?.[1]) {
      return `url('${firstMatch[1]}')`;
    }
  }

  return `url('${imageUrl}')`;
}

/** Stable pick per visual context — same slug/path always maps to the same cover on first paint. */
export function pickHeroBackgroundImage(headerImages: string[], visualSeed: string): string {
  if (headerImages.length === 0) {
    return '';
  }

  let hash = 0;
  for (let i = 0; i < visualSeed.length; i++) {
    hash = (hash * 31 + visualSeed.charCodeAt(i)) >>> 0;
  }

  const imageUrl = headerImages[hash % headerImages.length];
  return formatBackgroundImageUrl(normalizeProxyImageUrl(imageUrl));
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
