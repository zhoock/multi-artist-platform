import type { AlbumEditable, IArticles } from '@models';

import { isAlbumDraft, isAlbumVisibleOnArtistPage } from '@entities/album/lib/albumPublication';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

type ProfileContentInput = {
  siteName?: string | null;
  theBand?: string[];
  headerImages?: string[];
  socialLinks?: Record<string, string | undefined>;
};

export function countUniqueAlbums(albums: AlbumEditable[]): number {
  const ids = new Set(albums.map((album) => album.albumId).filter(Boolean));
  return ids.size > 0 ? ids.size : albums.length;
}

export function countUniqueArticles(articles: IArticles[]): number {
  const ids = new Set(articles.map((article) => article.articleId).filter(Boolean));
  return ids.size > 0 ? ids.size : articles.length;
}

/** Профиль «пуст» для онбординга: bio, hero, соцсети. site_name из регистрации не считается контентом. */
export function isArtistProfileEmpty(profile: ProfileContentInput): boolean {
  if (profile.headerImages?.some((image) => image.trim())) return false;
  if (profile.theBand?.some((line) => line.trim())) return false;
  if (Object.values(profile.socialLinks ?? {}).some((value) => value?.trim())) return false;
  return true;
}

/** Публичное тело профиля для посетителя: bio, hero, соцсети. Одного site_name недостаточно. */
export function profileHasPublicBodyContent(profile: ProfileContentInput): boolean {
  if (profile.headerImages?.some((image) => image.trim())) return true;
  if (profile.theBand?.some((line) => line.trim())) return true;
  if (Object.values(profile.socialLinks ?? {}).some((value) => value?.trim())) return true;
  return false;
}

export function filterAlbumsForArtistPageSurface(
  albums: AlbumEditable[],
  isOwner: boolean
): AlbumEditable[] {
  if (isOwner) {
    return albums.filter(
      (album) =>
        isAlbumDraft(album) ||
        (isAlbumVisibleOnArtistPage(album) &&
          typeof album.album === 'string' &&
          album.album.trim().length > 0 &&
          (album.tracks?.length ?? 0) > 0)
    );
  }
  return albums.filter(
    (album) =>
      isAlbumVisibleOnArtistPage(album) &&
      typeof album.album === 'string' &&
      album.album.trim().length > 0 &&
      (album.tracks?.length ?? 0) > 0
  );
}

export function isArticlePublicOnArtistPage(
  article: Pick<IArticles, 'isDraft' | 'visibility'>
): boolean {
  if (article.isDraft === true) return false;
  return normalizeTrackVisibility(article.visibility) !== 'hidden';
}

export function countPublishedPublicArticles(articles: IArticles[]): number {
  return articles.filter(isArticlePublicOnArtistPage).length;
}

/** Visitor-facing artist page: published tracks, public articles, or profile body. */
export function artistHasPublicPageContent(options: {
  albums: AlbumEditable[];
  articles: IArticles[];
  profileHasPublicBody: boolean;
}): boolean {
  return hasVisitorVisibleArtistContent({
    albums: options.albums,
    articlesCount: countPublishedPublicArticles(options.articles),
    profileHasPublicBody: options.profileHasPublicBody,
  });
}

export function hasVisitorVisibleArtistContent(options: {
  albums: AlbumEditable[];
  articlesCount: number;
  profileHasPublicBody: boolean;
}): boolean {
  if (hasPublishedPublicReleases(options.albums)) return true;
  if (options.articlesCount > 0) return true;
  if (options.profileHasPublicBody) return true;
  return false;
}

export function needsArtistOnboarding(options: {
  albumsCount: number;
  articlesCount: number;
  profileIsEmpty: boolean;
}): boolean {
  return options.albumsCount === 0 && options.articlesCount === 0 && options.profileIsEmpty;
}
