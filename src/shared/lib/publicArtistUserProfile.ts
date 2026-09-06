import type { SocialLinks } from '@shared/constants/socialLinks';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader } from '@shared/lib/auth';
import { normalizeProxyImageUrl } from '@shared/lib/proxyImageUrl';

export type PublicArtistUserProfileData = {
  name: string | null;
  publicSlug: string | null;
  theBand: string[];
  headerImages: string[];
  siteName: string | null;
  genreCode: string | null;
  socialLinks: SocialLinks;
};

type PublicArtistProfileFetchOptions = {
  lang?: string;
  noBandFallback?: boolean;
};

type PublicArtistProfileResponse = {
  success?: boolean;
  data?: {
    name?: string | null;
    publicSlug?: string | null;
    theBand?: string[];
    headerImages?: string[];
    siteName?: string | null;
    genreCode?: string;
    socialLinks?: SocialLinks;
  };
};

const profileCache = new Map<string, PublicArtistUserProfileData>();
const profileInflight = new Map<string, Promise<PublicArtistUserProfileData | null>>();

function normalizeProfileLang(lang?: string): 'ru' | 'en' {
  return (lang ?? 'ru').toLowerCase() === 'en' ? 'en' : 'ru';
}

/** Slug + effective lang — requests without `lang` share the same key as `lang=ru`. */
export function publicArtistUserProfileCacheKey(artistSlug: string, lang?: string): string {
  return `${artistSlug.trim().toLowerCase()}:${normalizeProfileLang(lang)}`;
}

export function getCachedPublicArtistUserProfile(
  artistSlug: string,
  lang?: string
): PublicArtistUserProfileData | null {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return null;
  return profileCache.get(publicArtistUserProfileCacheKey(slug, lang)) ?? null;
}

export function invalidatePublicArtistUserProfileCache(artistSlug?: string): void {
  if (!artistSlug?.trim()) {
    profileCache.clear();
    profileInflight.clear();
    return;
  }

  const normalized = artistSlug.trim().toLowerCase();
  for (const key of [...profileCache.keys()]) {
    if (key.startsWith(`${normalized}:`)) {
      profileCache.delete(key);
      profileInflight.delete(key);
    }
  }
}

/** Drop in-flight profile requests so stale responses cannot overwrite a Dashboard hero save. */
export function clearPublicArtistUserProfileInflight(artistSlug?: string): void {
  if (!artistSlug?.trim()) {
    profileInflight.clear();
    return;
  }

  const normalized = artistSlug.trim().toLowerCase();
  for (const key of [...profileInflight.keys()]) {
    if (key.startsWith(`${normalized}:`)) {
      profileInflight.delete(key);
    }
  }
}

/** Upsert headerImages on cached profile rows (creates a minimal row when missing). */
export function setCachedPublicArtistUserProfileHeaderImages(
  artistSlug: string,
  headerImages: string[]
): void {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return;

  const normalized = headerImages.map((url) => normalizeProxyImageUrl(String(url)));
  const emptyProfile: PublicArtistUserProfileData = {
    name: null,
    publicSlug: slug,
    theBand: [],
    headerImages: normalized,
    siteName: null,
    genreCode: null,
    socialLinks: {},
  };

  for (const lang of ['ru', 'en'] as const) {
    const key = publicArtistUserProfileCacheKey(slug, lang);
    const existing = profileCache.get(key);
    profileCache.set(key, existing ? { ...existing, headerImages: normalized } : emptyProfile);
  }
}

function mapProfileResponse(
  result: PublicArtistProfileResponse
): PublicArtistUserProfileData | null {
  if (!result.success || !result.data) return null;

  const headerImages = (result.data.headerImages ?? []).map((url) =>
    normalizeProxyImageUrl(String(url))
  );

  return {
    name: result.data.name?.trim() || null,
    publicSlug: result.data.publicSlug?.trim() || null,
    theBand: Array.isArray(result.data.theBand) ? result.data.theBand : [],
    headerImages,
    siteName: result.data.siteName?.trim() || null,
    genreCode: result.data.genreCode?.trim() || null,
    socialLinks: result.data.socialLinks ?? {},
  };
}

async function fetchPublicArtistUserProfileNetwork(
  artistSlug: string,
  options: PublicArtistProfileFetchOptions = {}
): Promise<PublicArtistUserProfileData | null> {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return null;

  const lang = normalizeProfileLang(options.lang);
  const url = buildApiUrl(
    '/api/user-profile',
    {
      lang,
      noBandFallback: options.noBandFallback ? '1' : undefined,
    },
    { includeArtist: true, artistSlugOverride: slug }
  );

  const response = await fetchWithAuthSession(url, {
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    return null;
  }

  const result = (await response.json()) as PublicArtistProfileResponse;
  return mapProfileResponse(result);
}

/**
 * Shared GET /api/user-profile?artist=… dedupe for all public artist-page consumers.
 * One inflight HTTP request per slug + effective lang (missing lang ≡ ru).
 */
export async function fetchPublicArtistUserProfile(
  artistSlug: string,
  options: PublicArtistProfileFetchOptions = {}
): Promise<PublicArtistUserProfileData | null> {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug) return null;

  const key = publicArtistUserProfileCacheKey(slug, options.lang);
  const cached = profileCache.get(key);
  if (cached) return cached;

  const pending = profileInflight.get(key);
  if (pending) return pending;

  const promise = fetchPublicArtistUserProfileNetwork(slug, options)
    .then((result) => {
      profileInflight.delete(key);
      if (result) {
        profileCache.set(key, result);
      }
      return result;
    })
    .catch(() => {
      profileInflight.delete(key);
      return null;
    });

  profileInflight.set(key, promise);
  return promise;
}
