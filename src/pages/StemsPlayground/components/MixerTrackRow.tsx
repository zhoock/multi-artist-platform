// src/pages/StemsPlayground/components/MixerTrackRow.tsx
import type { MixerTrack } from '../lib/types';
import { formatTrackDuration } from '../lib/formatTrackDuration';

type MixerTrackRowProps = {
  track: MixerTrack;
  index: number;
  onSelect: (trackId: string) => void;
};

/** Строка трека: номер, название, длительность, иконка воспроизведения. */
export function MixerTrackRow({ track, index, onSelect }: MixerTrackRowProps) {
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
      <span className="mixer-track-row__play icon-controller-play" aria-hidden />
    </button>
  );
}
