import '@shared/ui/skeleton/skeleton.scss';

/** Placeholder обложки и метаданных трека — та же геометрия, что у `.player__cover-wrapper`. */
export function PlayerHeaderSkeleton({ idPrefix = 'player-header' }: { idPrefix?: string }) {
  return (
    <div className="player__cover-wrapper" aria-busy="true" aria-labelledby={`${idPrefix}-loading`}>
      <span id={`${idPrefix}-loading`} className="visually-hidden">
        Loading track
      </span>
      <div className="player__cover player__cover--paused" aria-hidden="true">
        <div className="skeleton player__cover-skeleton" />
      </div>
      <div className="player__track-info player__track-info--skeleton" aria-hidden="true">
        <div className="skeleton player__track-info-skeleton-line player__track-info-skeleton-line--title" />
        <div className="skeleton player__track-info-skeleton-line player__track-info-skeleton-line--album" />
        <div className="skeleton player__track-info-skeleton-line player__track-info-skeleton-line--artist" />
      </div>
    </div>
  );
}
