import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { ArticlesSkeleton } from '@shared/ui/skeleton/ArticlesSkeleton';
import '@shared/ui/skeleton/skeleton.scss';
import './ArtistPageSkeleton.scss';

type ArtistPageSkeletonPart = 'hero' | 'main' | 'full';

type ArtistPageSkeletonProps = {
  part?: ArtistPageSkeletonPart;
};

export function ArtistPageSkeletonHero() {
  return (
    <section
      className="artist-page-skeleton__hero hero"
      aria-busy="true"
      aria-label="Loading artist page hero"
    >
      <div className="hero__content artist-page-skeleton__hero-content">
        <div className="artist-page-skeleton__hero-headline">
          <div className="skeleton artist-page-skeleton__hero-title" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

type ArtistPageSkeletonMainProps = {
  /** Artist page mounts the real albums grid ahead of the rest of the page (LCP cover). */
  withAlbums?: boolean;
};

export function ArtistPageSkeletonMain({ withAlbums = true }: ArtistPageSkeletonMainProps = {}) {
  return (
    <div className="artist-page-skeleton__main" aria-busy="true" aria-label="Loading artist page">
      {withAlbums ? (
        <section id="albums" className="albums main-background" aria-hidden="true">
          <div className="wrapper">
            <div className="skeleton artist-page-skeleton__section-heading" />
            <AlbumsSkeleton count={3} />
          </div>
        </section>
      ) : null}

      <section id="articles" className="articles main-background" aria-hidden="true">
        <div className="wrapper articles__wrapper">
          <div className="skeleton artist-page-skeleton__section-heading" />
          <ArticlesSkeleton count={3} />
        </div>
      </section>

      <section
        id="about"
        className="about main-background artist-page-skeleton__about"
        aria-hidden="true"
      >
        <div className="wrapper">
          <div className="skeleton artist-page-skeleton__section-heading" />
          <div className="artist-page-skeleton__about-lines">
            <div className="skeleton skeleton--text artist-page-skeleton__about-line" />
            <div className="skeleton skeleton--text artist-page-skeleton__about-line" />
            <div className="skeleton skeleton--text artist-page-skeleton__about-line artist-page-skeleton__about-line--short" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function ArtistPageSkeleton({ part = 'full' }: ArtistPageSkeletonProps) {
  if (part === 'hero') return <ArtistPageSkeletonHero />;
  if (part === 'main') return <ArtistPageSkeletonMain />;

  return (
    <>
      <ArtistPageSkeletonHero />
      <ArtistPageSkeletonMain />
    </>
  );
}

export default ArtistPageSkeleton;
