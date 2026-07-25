// src/pages/StemsPlayground/components/MixerAlbumList.tsx
import type { SupportedLang } from '@shared/model/lang';
import type { MixerAlbum } from '../lib/types';
import { pluralizeTracks, type TrackCountLabels } from '../lib/pluralizeTracks';
import { MixerAlbumCard } from './MixerAlbumCard';
import { MixerAlbumListSkeleton } from './MixerAlbumListSkeleton';

type MixerAlbumListProps = {
  albums: MixerAlbum[];
  loading: boolean;
  lang: SupportedLang;
  trackCountLabels: TrackCountLabels;
  emptyLabel: string;
  onSelectAlbum: (albumId: string) => void;
};

/** Вертикальный список альбомов первого уровня микшера. */
export function MixerAlbumList({
  albums,
  loading,
  lang,
  trackCountLabels,
  emptyLabel,
  onSelectAlbum,
}: MixerAlbumListProps) {
  if (loading) {
    return <MixerAlbumListSkeleton />;
  }

  if (albums.length === 0) {
    return <p className="mixer-level__hint">{emptyLabel}</p>;
  }

  return (
    <div className="mixer-album-list">
      {albums.map((album) => (
        <MixerAlbumCard
          key={album.albumId}
          album={album}
          trackCountLabel={pluralizeTracks(
            album.listedTrackCount > 0 ? album.listedTrackCount : album.tracks.length,
            lang,
            trackCountLabels
          )}
          onSelect={onSelectAlbum}
        />
      ))}
    </div>
  );
}
