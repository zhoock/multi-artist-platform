import './AlbumSkeleton.scss';

interface AlbumSkeletonProps {
  tracksCount?: number;
}

export function AlbumSkeleton({ tracksCount = 3 }: AlbumSkeletonProps) {
  return (
    <section className="album main-background" aria-label="Скелетон альбома">
      <div className="wrapper album__wrapper album-skeleton">
        <nav className="context-nav" aria-hidden="true">
          <div className="skeleton skeleton--context-nav" />
        </nav>

        <div className="item item-type-a album-skeleton__cover-block">
          <div className="skeleton skeleton--album-cover" />
          <ul className="share-list" role="list" aria-label="Скелетон кнопок поделиться">
            <li className="share-list__item">
              <div className="share-list__link skeleton" />
            </li>
          </ul>
        </div>

        <div className="item item-type-a">
          <h2 className="album-title">
            <div className="skeleton skeleton--album-title" />
          </h2>

          <div className="wrapper-album-play">
            <div className="skeleton skeleton--play-button-horizontal">
              <div className="skeleton skeleton--play-icon" />
              <div className="skeleton skeleton--play-progress" />
              <div className="skeleton skeleton--play-spacer" />
            </div>
          </div>

          <div className="tracks">
            {Array.from({ length: tracksCount }).map((_, index) => (
              <div
                key={`track-${index}`}
                className="tracks__btn"
                style={{ '--skeleton-index': index } as React.CSSProperties}
              >
                <div className="tracks__symbol skeleton" />
                <div className="tracks__title skeleton" />
                <div className="tracks__duration skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
