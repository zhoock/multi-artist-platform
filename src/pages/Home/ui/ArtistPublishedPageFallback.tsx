import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { ArticlesSkeleton } from '@shared/ui/skeleton/ArticlesSkeleton';
import '@shared/ui/skeleton/skeleton.scss';

/** Suspense fallback для `/?artist=` — те же скелетоны, что в AlbumsSection / ArticlesSection. */
export function ArtistPublishedPageFallback() {
  return (
    <>
      <section
        id="albums"
        className="albums main-background"
        aria-busy="true"
        aria-label="Loading albums"
      >
        <div className="wrapper">
          <h2>…</h2>
          <AlbumsSkeleton count={6} />
        </div>
      </section>
      <section
        id="articles"
        className="articles main-background"
        aria-busy="true"
        aria-label="Loading articles"
      >
        <div className="wrapper articles__wrapper">
          <h2>…</h2>
          <ArticlesSkeleton count={3} />
        </div>
      </section>
    </>
  );
}

export default ArtistPublishedPageFallback;
