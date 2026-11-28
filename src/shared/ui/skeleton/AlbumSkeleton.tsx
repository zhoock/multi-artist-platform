import '@entities/album/ui/album-layout.scss';
import '@shared/ui/contextNav/contextNav.scss';
import '@widgets/albumTracks/ui/style.scss';
import './AlbumSkeleton.scss';

interface AlbumSkeletonProps {
  tracksCount?: number;
}

export function AlbumSkeleton({ tracksCount = 1 }: AlbumSkeletonProps) {
  return (
    <section className="album main-background" aria-label="Скелетон альбома">
      <div className="wrapper album__wrapper album-skeleton">
        <nav className="context-nav" aria-hidden="true">
          <div className="skeleton skeleton--context-nav" />
        </nav>

        <div className="item item-type-a album-skeleton__cover-block">
          <div className="skeleton skeleton--album-cover" />
        </div>

        <div className="item item-type-a">
          <div className="album-skeleton__headings-slot">
            <h2 className="album-title" aria-hidden="true">
              {'\u00a0'}
            </h2>
            <h3 className="album-artist" aria-hidden="true">
              {'\u00a0'}
            </h3>
            <div className="album-skeleton__heading-bars" aria-hidden="true">
              <span className="skeleton album-skeleton__heading-bar album-skeleton__heading-bar--title" />
              <span className="skeleton album-skeleton__heading-bar album-skeleton__heading-bar--artist" />
            </div>
          </div>

          <div className="wrapper-album-play">
            <button type="button" className="album-play" disabled tabIndex={-1} aria-hidden="true">
              <span className="album-play__icon" aria-hidden>
                <span className="skeleton skeleton--album-play-icon" />
              </span>
              <span className="skeleton skeleton--album-play-label" />
            </button>
          </div>

          <div className="tracks">
            {Array.from({ length: tracksCount }).map((_, index) => (
              <div
                key={`track-${index}`}
                className="tracks__btn"
                style={{ '--skeleton-index': index } as React.CSSProperties}
                aria-hidden="true"
              >
                <span className="tracks__symbol skeleton" />
                <span className="tracks__title skeleton" />
                <span className="tracks__meta">
                  <span className="tracks__duration skeleton" />
                </span>
              </div>
            ))}
          </div>

          <div className="album-page-description" aria-hidden="true">
            <div className="skeleton skeleton--album-description-line" />
            <div className="skeleton skeleton--album-description-line" />
            <div className="skeleton skeleton--album-description-line skeleton--album-description-line--short" />
          </div>
        </div>
      </div>
    </section>
  );
}
