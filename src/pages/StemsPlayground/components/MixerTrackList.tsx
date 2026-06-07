// src/pages/StemsPlayground/components/MixerTrackList.tsx
import type { MixerTrack } from '../lib/types';
import { MixerTrackRow } from './MixerTrackRow';

type MixerTrackListProps = {
  tracks: MixerTrack[];
  onSelectTrack: (trackId: string) => void;
};

/** Список треков выбранного альбома (второй уровень микшера). */
export function MixerTrackList({ tracks, onSelectTrack }: MixerTrackListProps) {
  return (
    <div className="mixer-track-list">
      {tracks.map((track, index) => (
        <MixerTrackRow key={track.id} track={track} index={index} onSelect={onSelectTrack} />
      ))}
    </div>
  );
}
