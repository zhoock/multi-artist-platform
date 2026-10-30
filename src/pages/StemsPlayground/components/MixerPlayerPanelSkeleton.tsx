import '@shared/ui/skeleton/skeleton.scss';

type MixerPlayerPanelSkeletonProps = {
  stemRows?: number;
};

/** Плейсхолдер экрана микшера (waveform + стемы) при deep link / загрузке трека. */
export function MixerPlayerPanelSkeleton({ stemRows = 4 }: MixerPlayerPanelSkeletonProps) {
  const rows = Math.max(1, stemRows);

  return (
    <div
      className="mixer-player mixer-player--skeleton"
      aria-busy="true"
      aria-label="Loading mixer"
    >
      <div className="mixer-track-head mixer-track-head--skeleton" aria-hidden="true">
        <div className="skeleton mixer-player__skeleton-back" />
        <div className="skeleton mixer-player__skeleton-title" />
        <div className="skeleton mixer-player__skeleton-actions" />
      </div>
      <div className="skeleton mixer-player__skeleton-waveform" aria-hidden="true" />
      <div className="mixer-stem-list mixer-stem-list--skeleton" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="mixer-stem mixer-stem--skeleton"
            style={{ '--skeleton-index': index } as React.CSSProperties}
          >
            <div className="skeleton mixer-stem__skeleton-icon" />
            <div className="skeleton mixer-stem__skeleton-name" />
            <div className="skeleton mixer-stem__skeleton-slider" />
            <div className="skeleton mixer-stem__skeleton-btn" />
            <div className="skeleton mixer-stem__skeleton-btn" />
          </div>
        ))}
      </div>
    </div>
  );
}
