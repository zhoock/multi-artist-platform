import type { AppDispatch } from '@shared/model/appStore/types';
import { fetchArtistAlbumCatalog } from '@entities/album';
import { fetchArticles } from '@entities/article';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';

/** Thin catalog + public articles for `/?artist=` (Home and cross-route navigation). */
export function bootstrapPublicArtistPageSurfaces(
  dispatch: AppDispatch,
  artistSlug: string | null | undefined
): void {
  const slug = artistSlug?.trim() ?? '';
  if (!slug || !shouldUsePublicArtistCatalogInRedux()) return;

  void dispatch(
    fetchArtistAlbumCatalog({
      force: true,
      publicArtistSlug: slug,
    })
  );
  void dispatch(
    fetchArticles({
      force: true,
      forcePublicCatalog: true,
      publicArtistSlug: slug,
    })
  );
}
