// src/pages/StemsPlayground/components/MixerTrackListSkeleton.tsx
import '@shared/ui/skeleton/skeleton.scss';

type MixerTrackListSkeletonProps = {
  count?: number;
};

/** Плейсхолдер списка треков при загрузке AlbumDetails и стемов. */
export function MixerTrackListSkeleton({ count = 3 }: MixerTrackListSkeletonProps) {
  const rows = Math.max(1, count);

  return (
    <div
      className="mixer-track-list mixer-track-list--skeleton"
      aria-busy="true"
      aria-label="Loading tracks"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="mixer-track-row mixer-track-row--skeleton"
          aria-hidden="true"
          style={{ '--skeleton-index': index } as React.CSSProperties}
        >
          <div className="skeleton mixer-track-row__skeleton-number" />
          <div className="skeleton mixer-track-row__skeleton-title" />
          <div className="skeleton mixer-track-row__skeleton-duration" />
          <div className="skeleton mixer-track-row__skeleton-arrow" />
        </div>
      ))}
    </div>
  );
}
