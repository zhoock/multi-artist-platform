import { getStore } from '@shared/model/appStore';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import {
  filterValidHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
  setCachedArtistHeroHeaderImages,
} from '@shared/lib/artistHeroHeaderImages';
import {
  fetchPublicArtistUserProfile,
  getCachedPublicArtistUserProfile,
  invalidatePublicArtistUserProfileCache,
} from '@shared/lib/publicArtistUserProfile';

export const PROFILE_NAME_STORAGE_KEY = 'profile-name';

export function readStoredProfileDisplayName(): string {
  try {
    return localStorage.getItem(PROFILE_NAME_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

/** Подпись в UI: актуальное имя, затем кэш профиля, затем placeholder (например «—»). */
export function siteArtistUiLabel(displayName: string, emptyFallback = '—'): string {
  const a = displayName.trim();
  if (a) return a;
  const b = readStoredProfileDisplayName().trim();
  if (b) return b;
  return emptyFallback;
}

/** Подписи и alt для обложек: единое имя из профиля + название альбома (не albums.artist). */
export function formatAlbumDisplayFullName(siteDisplayName: string, albumTitle: string): string {
  const s = siteDisplayName.trim();
  const t = (albumTitle ?? '').trim();
  if (s && t) return `${s} — ${t}`;
  return t || s || '';
}

export type PublicProfileForDisplay = {
  displayName: string;
  publicSlug: string | null;
};

function resolveArtistSlug(artistSlugOverride?: string | null): string {
  return (artistSlugOverride?.trim() || selectPublicArtistSlug(getStore().getState()) || '').trim();
}

function mapProfileToDisplay(
  profile: ReturnType<typeof getCachedPublicArtistUserProfile>
): PublicProfileForDisplay {
  const displayName = (profile?.siteName ?? profile?.name ?? '').trim();
  return {
    displayName,
    publicSlug: profile?.publicSlug ?? null,
  };
}

export function getCachedPublicProfileForDisplay(
  lang: string,
  artistSlugOverride?: string | null
): PublicProfileForDisplay | null {
  const slug = resolveArtistSlug(artistSlugOverride);
  if (!slug) return null;
  const profile = getCachedPublicArtistUserProfile(slug, lang);
  if (!profile) return null;
  const mapped = mapProfileToDisplay(profile);
  return mapped.displayName.trim() ? mapped : null;
}

export function invalidatePublicProfileDisplayCache(slug?: string): void {
  invalidatePublicArtistUserProfileCache(slug);
  invalidateArtistHeroHeaderImagesCache(slug);
}

/** Стартует загрузку профиля заранее (route loader, prefetch). */
export function prefetchPublicProfileForDisplay(
  lang: string,
  artistSlugOverride?: string | null
): void {
  const slug = resolveArtistSlug(artistSlugOverride);
  if (!slug) return;
  void fetchPublicProfileForDisplay(lang, slug);
}

async function fetchPublicProfileForDisplayNetwork(
  lang: string,
  slug: string
): Promise<PublicProfileForDisplay> {
  const fallbackName = '';
  const profile = await fetchPublicArtistUserProfile(slug, { lang });

  if (!profile) {
    setCachedArtistHeroHeaderImages(slug, []);
    return { displayName: fallbackName, publicSlug: null };
  }

  const headerImages = filterValidHeroHeaderImages(profile.headerImages);
  setCachedArtistHeroHeaderImages(slug, headerImages);

  const displayName = (profile.siteName ?? profile.name ?? '').trim() || fallbackName;
  return { displayName, publicSlug: profile.publicSlug };
}

/**
 * Публичный профиль: имя для UI (site_name) и public_slug владельца страницы / ?artist=.
 * Кэширует ответ и дедуплицирует параллельные запросы.
 */
export async function fetchPublicProfileForDisplay(
  lang: string,
  artistSlugOverride?: string | null
): Promise<PublicProfileForDisplay> {
  const slug = resolveArtistSlug(artistSlugOverride);
  if (!slug) {
    return { displayName: readStoredProfileDisplayName(), publicSlug: null };
  }

  const cached = getCachedPublicProfileForDisplay(lang, slug);
  if (cached?.displayName.trim()) return cached;

  return fetchPublicProfileForDisplayNetwork(lang, slug);
}

/**
 * Только отображаемое имя (для мини-плеера / мета без slug).
 */
export async function fetchPublicProfileDisplayName(
  lang: string,
  artistSlugOverride?: string | null
): Promise<string> {
  const r = await fetchPublicProfileForDisplay(lang, artistSlugOverride);
  return r.displayName;
}

export type ProfileNameUpdatedDetail = { name: string; publicSlug?: string };
