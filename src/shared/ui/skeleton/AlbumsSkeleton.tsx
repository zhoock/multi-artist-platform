import '@entities/album/ui/album-list.scss';
import '@entities/album/ui/album-card.scss';
import './AlbumsSkeleton.scss';

interface AlbumsSkeletonProps {
  count?: number;
}

export function AlbumsSkeleton({ count = 6 }: AlbumsSkeletonProps) {
  return (
    <div className="albums__list">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="albums__card">
          <div className="skeleton skeleton--album-cover" />
          <div className="albums__description">
            <div className="skeleton skeleton--text skeleton--title skeleton--full-width" />
            <div className="skeleton skeleton--text skeleton--date" />
          </div>
        </div>
      ))}
    </div>
  );
}
