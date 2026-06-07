// src/pages/StemsPlayground/components/MixerAlbumCard.tsx
import { ChevronRight as ChevronRightIcon } from 'lucide-react';
import { AlbumCoverImage } from '@entities/album/ui/AlbumCoverImage';
import type { MixerAlbum } from '../lib/types';

type MixerAlbumCardProps = {
  album: MixerAlbum;
  trackCountLabel: string;
  onSelect: (albumId: string) => void;
};

/** Горизонтальная карточка альбома: обложка, название, год, кол-во треков, стрелка. */
export function MixerAlbumCard({ album, trackCountLabel, onSelect }: MixerAlbumCardProps) {
  return (
    <button
      type="button"
      className="mixer-album-card"
      onClick={() => onSelect(album.albumId)}
      aria-label={album.title}
    >
      <span className="mixer-album-card__thumb">
        {album.cover ? (
          <AlbumCoverImage
            cover={album.cover}
            userId={album.userId}
            alt={album.title}
            contextAlbumId={album.albumId}
            logContext="mixer"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <img src="/images/album-placeholder.png" alt={album.title} loading="lazy" />
        )}
      </span>
      <span className="mixer-album-card__info">
        <span className="mixer-album-card__title">{album.title}</span>
        {album.year ? <span className="mixer-album-card__year">{album.year}</span> : null}
        <span className="mixer-album-card__count">{trackCountLabel}</span>
      </span>
      <ChevronRightIcon className="mixer-album-card__arrow" aria-hidden size={22} />
    </button>
  );
}
