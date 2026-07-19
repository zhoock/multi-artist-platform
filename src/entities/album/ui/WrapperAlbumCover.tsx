// src/entities/album/ui/WrapperAlbumCover.tsx
import { Link } from 'react-router-dom';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import type { WrapperAlbumCoverProps } from 'models';

import './style.scss';

export default function WrapperAlbumCover({
  albumId,
  date,
  album,
  children,
}: WrapperAlbumCoverProps) {
  const location = useEffectiveLocation();
  const params = new URLSearchParams(location.search);
  const artist = params.get('artist');
  const albumUrl = artist
    ? `/albums/${albumId}?artist=${encodeURIComponent(artist)}`
    : `/albums/${albumId}`;

  return (
    <div className="albums__card">
      <Link to={albumUrl}>
        {children}
        <div className="albums__description">
          {album}

          <time dateTime={date}>
            <small>{date?.slice(0, 4)}</small>
          </time>
        </div>
      </Link>
    </div>
  );
}
