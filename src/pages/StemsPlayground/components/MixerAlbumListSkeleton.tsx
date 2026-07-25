// src/pages/StemsPlayground/components/MixerAlbumListSkeleton.tsx
import '@shared/ui/skeleton/skeleton.scss';

type MixerAlbumListSkeletonProps = {
  count?: number;
};

/** Плейсхолдер списка альбомов при загрузке каталога микшера. */
export function MixerAlbumListSkeleton({ count = 3 }: MixerAlbumListSkeletonProps) {
  const rows = Math.max(1, count);

  return (
    <div
      className="mixer-album-list mixer-album-list--skeleton"
      aria-busy="true"
      aria-label="Loading albums"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="mixer-album-card mixer-album-card--skeleton"
          aria-hidden="true"
          style={{ '--skeleton-index': index } as React.CSSProperties}
        >
          <div className="skeleton mixer-album-card__skeleton-thumb" />
          <span className="mixer-album-card__info">
            <div className="skeleton mixer-album-card__skeleton-title" />
            <div className="skeleton mixer-album-card__skeleton-meta" />
            <div className="skeleton mixer-album-card__skeleton-meta mixer-album-card__skeleton-meta--short" />
          </span>
          <div className="skeleton mixer-album-card__skeleton-arrow" />
        </div>
      ))}
    </div>
  );
}
