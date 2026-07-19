import type { NavigateFunction } from 'react-router-dom';

import type { AlbumEditable, IArticles } from '@models';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import { isArtistAccount, isListenerAccount } from '@shared/lib/accountType';
import {
  artistHasPublicPageContent,
  countUniqueAlbums,
  countUniqueArticles,
  isArtistProfileEmpty,
  needsArtistOnboarding,
  profileHasPublicBodyContent,
} from '@shared/lib/artistPageContent';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader, getUser, isEmailVerified, type AuthUser } from '@shared/lib/auth';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { writeCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';
import {
  clearFirstArtistOnboardingPending,
  hasFirstArtistOnboardingPending,
} from '@shared/lib/authIntent/artistOnboardingRedirect';
import { sanitizeListenerPostAuthDestination } from '@shared/lib/authReturnUrl';

export type OwnArtistPageState = {
  publicSlug: string | null;
  hasPublicReleases: boolean;
  hasPublicPageContent: boolean;
  needsOnboarding: boolean;
  albumsCount: number;
  articlesCount: number;
  profileIsEmpty: boolean;
};

export function buildOwnArtistPagePath(publicSlug: string): string {
  return `/?artist=${encodeURIComponent(publicSlug.trim())}`;
}

export function isDefaultHomePath(pathname: string, search: string): boolean {
  return pathname === '/' && !new URLSearchParams(search).has('artist');
}

export function isOnOwnArtistOnboardingPage(
  pathname: string,
  search: string,
  publicSlug: string
): boolean {
  if (pathname !== '/') return false;
  const currentArtist = new URLSearchParams(search).get('artist')?.trim().toLowerCase();
  return currentArtist === publicSlug.trim().toLowerCase();
}

/** Post-registration flag or unverified artist landing on home without releases. */
export function shouldTryArtistOnboardingRedirect(
  user: AuthUser | null | undefined,
  options: { pendingRegistration: boolean; onDefaultHome: boolean }
): boolean {
  if (!user || !isArtistAccount(user)) return false;
  if (options.pendingRegistration) return true;
  return options.onDefaultHome && !isEmailVerified(user);
}

/**
 * After auth, send new artists without any content to owner onboarding instead of universe home.
 */
export async function resolveArtistOnboardingDestination(
  lang: string,
  options: {
    user: AuthUser | null | undefined;
    defaultDestination: string;
    pendingRegistration: boolean;
  }
): Promise<string> {
  const { user, defaultDestination, pendingRegistration } = options;
  if (!user || isListenerAccount(user)) {
    return sanitizeListenerPostAuthDestination(defaultDestination);
  }

  const onDefaultHome = defaultDestination === '/';
  if (!shouldTryArtistOnboardingRedirect(user, { pendingRegistration, onDefaultHome })) {
    return defaultDestination;
  }

  if (pendingRegistration) clearFirstArtistOnboardingPending();

  const state = await fetchOwnArtistPageState(lang);
  if (state.needsOnboarding && state.publicSlug) {
    return buildOwnArtistPagePath(state.publicSlug);
  }

  return defaultDestination;
}

export function hasPendingArtistOnboarding(user: AuthUser | null | undefined): boolean {
  const userId = user?.id?.trim();
  return Boolean(userId && hasFirstArtistOnboardingPending(userId));
}

function normalizeAlbums(data: unknown): AlbumEditable[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is AlbumEditable => typeof item === 'object' && item !== null);
}

function normalizeArticles(data: unknown): IArticles[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is IArticles => typeof item === 'object' && item !== null);
}

export async function fetchOwnArtistPageState(lang: string): Promise<OwnArtistPageState> {
  const empty: OwnArtistPageState = {
    publicSlug: null,
    hasPublicReleases: false,
    hasPublicPageContent: false,
    needsOnboarding: false,
    albumsCount: 0,
    articlesCount: 0,
    profileIsEmpty: true,
  };

  try {
    const profileResponse = await fetchWithAuthSession(
      buildApiUrl('/api/user-profile', { lang }, { includeArtist: false }),
      {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          ...getAuthHeader(),
        },
      }
    );

    if (!profileResponse.ok) return empty;

    const profileResult = (await profileResponse.json()) as {
      success?: boolean;
      data?: {
        publicSlug?: string | null;
        siteName?: string | null;
        theBand?: string[];
        headerImages?: string[];
        socialLinks?: Record<string, string | undefined>;
      };
    };
    const profileData = profileResult.success ? profileResult.data : undefined;
    const publicSlug = profileData?.publicSlug?.trim() || null;
    if (!publicSlug) return empty;

    const userId = getUser()?.id?.trim();
    if (userId) writeCachedOwnPublicSlug(userId, publicSlug);

    const profileIsEmpty = isArtistProfileEmpty({
      siteName: profileData?.siteName,
      theBand: profileData?.theBand,
      headerImages: profileData?.headerImages,
      socialLinks: profileData?.socialLinks,
    });

    const [albumsResponse, articlesResponse] = await Promise.all([
      fetchWithAuthSession(buildApiUrl('/api/albums', { lang }, { includeArtist: false }), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          ...getAuthHeader(),
        },
      }),
      fetchWithAuthSession(
        buildApiUrl('/api/articles-api', { includeDrafts: true }, { includeArtist: false }),
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            ...getAuthHeader(),
          },
        }
      ),
    ]);

    const albumsResult = albumsResponse.ok
      ? ((await albumsResponse.json()) as { success?: boolean; data?: unknown })
      : null;
    const albums = albumsResult?.success ? normalizeAlbums(albumsResult.data) : [];
    const albumsCount = countUniqueAlbums(albums);
    const hasPublicReleases = hasPublishedPublicReleases(albums);

    let articles: IArticles[] = [];
    if (articlesResponse.ok) {
      const articlesPayload = await articlesResponse.json();
      const list = Array.isArray(articlesPayload)
        ? articlesPayload
        : (articlesPayload.data ?? articlesPayload.articles ?? []);
      articles = normalizeArticles(list);
    }
    const articlesCount = countUniqueArticles(articles);
    const profileHasPublicBody = profileHasPublicBodyContent({
      siteName: profileData?.siteName,
      theBand: profileData?.theBand,
      headerImages: profileData?.headerImages,
      socialLinks: profileData?.socialLinks,
    });
    const hasPublicPageContent = artistHasPublicPageContent({
      albums,
      articles,
      profileHasPublicBody,
    });

    return {
      publicSlug,
      hasPublicReleases,
      hasPublicPageContent,
      albumsCount,
      articlesCount,
      profileIsEmpty,
      needsOnboarding: needsArtistOnboarding({ albumsCount, articlesCount, profileIsEmpty }),
    };
  } catch {
    return empty;
  }
}

export type OpenOwnArtistPageOptions = {
  /** Меню шапки и in-app переходы — всегда в этой вкладке (без мигания онбординга в новой). */
  sameTab?: boolean;
};

export function openOwnArtistPage(
  publicSlug: string,
  hasPublicPageContent: boolean,
  navigate: NavigateFunction,
  options?: OpenOwnArtistPageOptions
): void {
  const path = buildOwnArtistPagePath(publicSlug);
  if (options?.sameTab || !hasPublicPageContent) {
    navigate(path);
    return;
  }
  window.open(path, '_blank', 'noopener,noreferrer');
}
