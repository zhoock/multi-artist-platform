import {
  type ArtistPageSkeletonVariant,
  resolveArtistPageSkeletonVariant,
} from '@shared/lib/artistPageBuilder';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { ArticlesSkeleton } from '@shared/ui/skeleton/ArticlesSkeleton';
import '@shared/ui/skeleton/skeleton.scss';
import './ArtistPageSkeleton.scss';

export type { ArtistPageSkeletonVariant };
export { resolveArtistPageSkeletonVariant };

/**
 * `public` — нейтральные плейсхолдеры Hero и секций (без UI конструктора).
 * `builder` — только внешние прямоугольники карточек (без внутренней вёрстки).
 */

type ArtistPageSkeletonPart = 'hero' | 'main' | 'footer-social' | 'full';

type ArtistPageSkeletonProps = {
  part?: ArtistPageSkeletonPart;
  /** Defaults to `public` so suspense/early loads never flash builder chrome. */
  variant?: ArtistPageSkeletonVariant;
};

type ArtistPageSkeletonPartProps = {
  variant?: ArtistPageSkeletonVariant;
};

export function ArtistPageSkeletonHero({ variant = 'public' }: ArtistPageSkeletonPartProps) {
  const isBuilder = variant === 'builder';

  return (
    <section
      className={`artist-page-skeleton__hero hero artist-page-skeleton__hero--${variant}`}
      aria-busy="true"
      aria-label="Loading artist page hero"
    >
      <div className="hero__content artist-page-skeleton__hero-content">
        <div className="artist-page-skeleton__hero-headline">
          <div className="skeleton artist-page-skeleton__hero-title" aria-hidden="true" />
          {isBuilder ? (
            <div
              className="skeleton artist-page-skeleton__card artist-page-skeleton__card--hero-cover"
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ArtistPageSkeletonMain({ variant = 'public' }: ArtistPageSkeletonPartProps) {
  const isBuilder = variant === 'builder';

  if (isBuilder) {
    return (
      <div
        className="artist-page-skeleton__main artist-page-skeleton__main--builder"
        aria-busy="true"
        aria-label="Loading artist page"
      >
        <section className="artist-page-skeleton__payment-bar" aria-hidden="true">
          <div className="artist-page-skeleton__payment-bar-inner wrapper">
            <div className="skeleton artist-page-skeleton__card artist-page-skeleton__card--bar" />
          </div>
        </section>

        <section id="albums" className="albums main-background" aria-hidden="true">
          <div className="wrapper">
            <div className="skeleton artist-page-skeleton__section-heading" />
            <div className="skeleton artist-page-skeleton__card artist-page-skeleton__card--section" />
          </div>
        </section>

        <section id="articles" className="articles main-background" aria-hidden="true">
          <div className="wrapper articles__wrapper">
            <div className="skeleton artist-page-skeleton__section-heading" />
            <div className="skeleton artist-page-skeleton__card artist-page-skeleton__card--section" />
          </div>
        </section>

        <section
          id="about"
          className="about main-background artist-page-skeleton__about"
          aria-hidden="true"
        >
          <div className="wrapper">
            <div className="skeleton artist-page-skeleton__section-heading artist-page-skeleton__section-heading--wide" />
            <div className="skeleton artist-page-skeleton__card artist-page-skeleton__card--section" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="artist-page-skeleton__main" aria-busy="true" aria-label="Loading artist page">
      <section id="albums" className="albums main-background" aria-hidden="true">
        <div className="wrapper">
          <div className="skeleton artist-page-skeleton__section-heading" />
          <AlbumsSkeleton count={3} />
        </div>
      </section>

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

/** Builder-only: social constructor card. Public pages omit this (may never appear). */
export function ArtistPageSkeletonFooterSocial({
  variant = 'public',
}: ArtistPageSkeletonPartProps) {
  if (variant !== 'builder') {
    return null;
  }

  return (
    <div
      className="artist-page-skeleton__footer-social"
      aria-busy="true"
      aria-label="Loading social links"
    >
      {/* Footer already wraps children in `.wrapper` — don't nest another. */}
      <div
        className="skeleton artist-page-skeleton__card artist-page-skeleton__card--bar"
        aria-hidden="true"
      />
    </div>
  );
}

export function ArtistPageSkeleton({ part = 'full', variant = 'public' }: ArtistPageSkeletonProps) {
  if (part === 'hero') return <ArtistPageSkeletonHero variant={variant} />;
  if (part === 'main') return <ArtistPageSkeletonMain variant={variant} />;
  if (part === 'footer-social') return <ArtistPageSkeletonFooterSocial variant={variant} />;

  return (
    <>
      <ArtistPageSkeletonHero variant={variant} />
      <ArtistPageSkeletonMain variant={variant} />
    </>
  );
}

export default ArtistPageSkeleton;
