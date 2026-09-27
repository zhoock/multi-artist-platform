import type { AppDispatch } from '@shared/model/appStore/types';
import { fetchArtistAlbumCatalog } from '@entities/album';
import { fetchArticles } from '@entities/article';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';

/** Thin catalog for LCP album cover — respects Redux `condition` (no redundant `force`). */
export function bootstrapPublicArtistAlbumCatalog(
  dispatch: AppDispatch,
  artistSlug: string | null | undefined
): void {
  const slug = artistSlug?.trim() ?? '';
  if (!slug || !shouldUsePublicArtistCatalogInRedux()) return;

  void dispatch(
    fetchArtistAlbumCatalog({
      publicArtistSlug: slug,
    })
  );
}

/** Public articles for artist hub surfaces — not on the LCP-critical path. */
export function bootstrapPublicArtistArticlesCatalog(
  dispatch: AppDispatch,
  artistSlug: string | null | undefined
): void {
  const slug = artistSlug?.trim() ?? '';
  if (!slug || !shouldUsePublicArtistCatalogInRedux()) return;

  void dispatch(
    fetchArticles({
      forcePublicCatalog: true,
      publicArtistSlug: slug,
    })
  );
}

/**
 * LCP-critical bootstrap: thin album catalog only.
 * Articles load via `bootstrapPublicArtistArticlesCatalog` after first paint (see HomePage).
 */
export function bootstrapPublicArtistPageSurfaces(
  dispatch: AppDispatch,
  artistSlug: string | null | undefined
): void {
  bootstrapPublicArtistAlbumCatalog(dispatch, artistSlug);
}
