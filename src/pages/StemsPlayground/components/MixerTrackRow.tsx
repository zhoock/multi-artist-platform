// src/pages/StemsPlayground/components/MixerTrackRow.tsx
import { ChevronRight as ChevronRightIcon, Lock as LockIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import type { MixerTrack } from '../lib/types';
import { formatTrackDuration } from '../lib/formatTrackDuration';

type MixerTrackRowProps = {
  track: MixerTrack;
  index: number;
  onSelect: (trackId: string) => void;
};

/** Строка трека: номер, название, длительность, стрелка перехода. */
export function MixerTrackRow({ track, index, onSelect }: MixerTrackRowProps) {
  if (track.locked) {
    return (
      <div className="mixer-track-row mixer-track-row--locked" aria-label={track.title}>
        <span className="mixer-track-row__lock" aria-hidden>
          <LockIcon
            {...dashboardActionIconProps({
              size: 18,
              className: 'mixer-track-row__lock-icon',
            })}
          />
        </span>
        <span className="mixer-track-row__title">{track.title}</span>
        <span className="mixer-track-row__duration">{formatTrackDuration(track.duration)}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="mixer-track-row"
      onClick={() => onSelect(track.id)}
      aria-label={track.title}
    >
      <span className="mixer-track-row__number">{String(index + 1).padStart(2, '0')}</span>
      <span className="mixer-track-row__title">{track.title}</span>
      <span className="mixer-track-row__duration">{formatTrackDuration(track.duration)}</span>
      <ChevronRightIcon className="mixer-track-row__arrow" aria-hidden size={22} />
    </button>
  );
}
