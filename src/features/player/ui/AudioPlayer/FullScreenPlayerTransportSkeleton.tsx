import '@shared/ui/skeleton/skeleton.scss';

type FullScreenPlayerTransportSkeletonProps = {
  showVolumeControl: boolean;
};

/** Transport shell: progress → prev/play/next → volume → secondary (только для Suspense skeleton). */
export function FullScreenPlayerTransportSkeleton({
  showVolumeControl,
}: FullScreenPlayerTransportSkeletonProps) {
  return (
    <div className="player__transport-column" aria-hidden="true">
      <div className="player__progress-container">
        <div className="player__progress-bar">
          <span className="skeleton player__skeleton-surface player__skeleton-progress-range" />
        </div>
        <div className="player__time-container">
          <span className="skeleton player__skeleton-surface player__skeleton-time player__skeleton-time--current" />
          <span className="skeleton player__skeleton-surface player__skeleton-time player__skeleton-time--remaining" />
        </div>
      </div>

      <div className="player__controls player__controls--skeleton">
        <span className="player__transport-button player__transport-button--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-transport-glyph player__skeleton-transport-glyph--skip" />
        </span>
        <span className="player__transport-button player__transport-button--play player__transport-button--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-transport-glyph player__skeleton-transport-glyph--play" />
        </span>
        <span className="player__transport-button player__transport-button--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-transport-glyph player__skeleton-transport-glyph--skip" />
        </span>
      </div>

      {showVolumeControl ? (
        <div className="player__volume-control player__volume-control--skeleton">
          <span className="player__volume-icon">
            <span className="skeleton player__skeleton-surface player__skeleton-volume-glyph" />
          </span>
          <span className="skeleton player__skeleton-surface player__skeleton-volume-range" />
          <span className="player__volume-icon">
            <span className="skeleton player__skeleton-surface player__skeleton-volume-glyph" />
          </span>
        </div>
      ) : null}

      <div className="player__secondary-controls player__secondary-controls--skeleton">
        <span className="player__control-button player__control-button--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-secondary-glyph" />
        </span>
        <span className="player__control-button player__control-button--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-secondary-glyph" />
        </span>
        <span className="player__lyrics-toggle player__lyrics-toggle--skeleton">
          <span className="skeleton player__skeleton-surface player__skeleton-secondary-glyph" />
        </span>
      </div>
    </div>
  );
}
