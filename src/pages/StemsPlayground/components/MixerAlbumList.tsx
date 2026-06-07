// src/pages/StemsPlayground/components/MixerAlbumList.tsx
import type { SupportedLang } from '@shared/model/lang';
import type { MixerAlbum } from '../lib/types';
import { pluralizeTracks, type TrackCountLabels } from '../lib/pluralizeTracks';
import { MixerAlbumCard } from './MixerAlbumCard';

type MixerAlbumListProps = {
  albums: MixerAlbum[];
  loading: boolean;
  lang: SupportedLang;
  trackCountLabels: TrackCountLabels;
  emptyLabel: string;
  loadingLabel: string;
  onSelectAlbum: (albumId: string) => void;
};

/** Вертикальный список альбомов первого уровня микшера. */
export function MixerAlbumList({
  albums,
  loading,
  lang,
  trackCountLabels,
  emptyLabel,
  loadingLabel,
  onSelectAlbum,
}: MixerAlbumListProps) {
  if (loading) {
    return <p className="mixer-level__hint">{loadingLabel}</p>;
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
          trackCountLabel={pluralizeTracks(album.tracks.length, lang, trackCountLabels)}
          onSelect={onSelectAlbum}
        />
      ))}
    </div>
  );
}
