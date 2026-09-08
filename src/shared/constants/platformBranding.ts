/** Temporary platform display name until the final brand is chosen. */
export const PLATFORM_DISPLAY_NAME = {
  ru: 'Название сайта',
  en: 'Site Name',
} as const;

export type PlatformLang = keyof typeof PLATFORM_DISPLAY_NAME;

export function platformDisplayName(lang: string): string {
  return lang === 'en' ? PLATFORM_DISPLAY_NAME.en : PLATFORM_DISPLAY_NAME.ru;
}

/** Default SEO copy for platform-level pages (home scene, payment returns without overrides). */
export const PLATFORM_SEO = {
  ru: {
    title: 'Название сайта — музыкальная платформа для независимых артистов',
    description:
      'Музыкальная платформа для независимых артистов: альбомы, статьи, коллекции и поддержка музыкантов.',
  },
  en: {
    title: 'Site Name — music platform for independent artists',
    description:
      'Music platform for independent artists: albums, articles, collections, and artist support.',
  },
} as const;

export type PlatformSeoCopy = (typeof PLATFORM_SEO)[PlatformLang];

export function platformSeoForLang(lang: string): PlatformSeoCopy {
  return lang === 'en' ? PLATFORM_SEO.en : PLATFORM_SEO.ru;
}

export const SEO_DESCRIPTION_MAX_LENGTH = 160;

export type ResolvedPageSeo = {
  title: string;
  description: string;
  canonical: string;
  /** True when title/description are artist-specific (not platform fallback copy). */
  isArtistSpecific: boolean;
};

export type ArtistPageSeoInput = {
  lang: string;
  artistSlug: string;
  artistName?: string | null;
  aboutText?: string | null;
  /** Ignore artist fields; use platform title/description (e.g. artist not found). */
  forcePlatformFallback?: boolean;
};

export function truncateSeoDescription(
  text: string,
  maxLength: number = SEO_DESCRIPTION_MAX_LENGTH
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function artistSeoDescriptionFallback(lang: string, artistName: string): string {
  const name = artistName.trim();
  if (lang === 'en') {
    return `${name}: albums, articles, and music on ${PLATFORM_DISPLAY_NAME.en}.`;
  }
  return `${name}: альбомы, статьи и музыка на ${PLATFORM_DISPLAY_NAME.ru}.`;
}

/**
 * Artist page SEO: artist name + about excerpt when available; platform SEO as fallback.
 * Caller supplies canonical (artist URL for public pages; platform home when forcePlatformFallback).
 */
export function buildArtistPageSeo(
  input: ArtistPageSeoInput,
  canonicalUrl: string
): ResolvedPageSeo {
  const platform = platformSeoForLang(input.lang);
  const slug = input.artistSlug.trim();

  if (!slug || input.forcePlatformFallback) {
    return {
      ...platform,
      canonical: canonicalUrl,
      isArtistSpecific: false,
    };
  }

  const artistName = input.artistName?.trim() ?? '';
  if (!artistName) {
    return {
      ...platform,
      canonical: canonicalUrl,
      isArtistSpecific: false,
    };
  }

  const about = input.aboutText?.trim();
  const description = about
    ? truncateSeoDescription(about)
    : artistSeoDescriptionFallback(input.lang, artistName);

  return {
    title: `${artistName} — ${platformDisplayName(input.lang)}`,
    description,
    canonical: canonicalUrl,
    isArtistSpecific: true,
  };
}
