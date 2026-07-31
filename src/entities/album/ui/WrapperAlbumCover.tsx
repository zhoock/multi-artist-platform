// src/entities/album/ui/WrapperAlbumCover.tsx
import { Link } from 'react-router-dom';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { useLang } from '@app/providers/lang';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import type { WrapperAlbumCoverProps } from 'models';

import './album-card.scss';

export default function WrapperAlbumCover({
  albumId,
  date,
  album,
  children,
}: WrapperAlbumCoverProps) {
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const artistSlug = searchParams.get('artist') ?? '';

  return (
    <div className="albums__card">
      <Link to={buildPublicAlbumPagePath(lang, albumId ?? '', artistSlug)}>
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
