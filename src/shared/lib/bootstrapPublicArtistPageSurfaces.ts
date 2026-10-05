import type { AppDispatch } from '@shared/model/appStore/types';
import { fetchArtistAlbumCatalog } from '@entities/album';
import { fetchArticles } from '@entities/article';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';

export type BootstrapPublicArtistCatalogOptions = {
  /**
   * Background SWR refetch when Redux already holds this slug (artist page re-entry).
   * Same mechanism as `executePublicSurfaceRevalidate` catalog scope — keeps last-good UI.
   */
  revalidate?: boolean;
};

/** Thin catalog for LCP album cover. Loader prefetch omits `revalidate`; artist surface entry sets it. */
export function bootstrapPublicArtistAlbumCatalog(
  dispatch: AppDispatch,
  artistSlug: string | null | undefined,
  options?: BootstrapPublicArtistCatalogOptions
): void {
  const slug = artistSlug?.trim() ?? '';
  if (!slug || !shouldUsePublicArtistCatalogInRedux()) return;

  void dispatch(
    fetchArtistAlbumCatalog({
      publicArtistSlug: slug,
      force: options?.revalidate === true,
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
  artistSlug: string | null | undefined,
  options?: BootstrapPublicArtistCatalogOptions
): void {
  bootstrapPublicArtistAlbumCatalog(dispatch, artistSlug, options);
}
