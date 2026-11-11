import { memo, useCallback, useMemo, useState } from 'react';
import type { CoverProps } from 'models';
import { getAlbumBackCoverPublicUrl, getAlbumCoverCacheVersion } from '@shared/lib/albumCoverUrl';
import AlbumCover from './AlbumCover';

export type AlbumPageCoverProps = CoverProps & {
  backCover?: string;
};

const TOUCH_FLIP_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';

function AlbumPageCover({ backCover, ...coverProps }: AlbumPageCoverProps) {
  const hasBackCover = Boolean(backCover?.trim());
  const [touchFlipped, setTouchFlipped] = useState(false);

  const handleCoverTap = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia(TOUCH_FLIP_MEDIA_QUERY).matches) return;
    setTouchFlipped((flipped) => !flipped);
  }, []);

  const backSrc = useMemo(() => {
    if (!hasBackCover || !coverProps.userId || !backCover) return null;
    const url = getAlbumBackCoverPublicUrl(coverProps.userId, backCover);
    if (!url) return null;
    const cacheBust = getAlbumCoverCacheVersion(backCover);
    return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBust)}`;
  }, [backCover, coverProps.userId, hasBackCover]);

  if (!hasBackCover || !backSrc) {
    return <AlbumCover {...coverProps} />;
  }

  return (
    <div className="album-page-cover">
      {/* In-flow size reference: same DOM/CSS as plain AlbumCover (picture + .album-cover__image). */}
      <div className="album-page-cover__sizer" aria-hidden="true">
        <AlbumCover {...coverProps} />
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- coarse-pointer tap flip; desktop uses hover only */}
      <div
        className={touchFlipped ? 'album-cover-flip album-cover-flip--flipped' : 'album-cover-flip'}
        onClick={handleCoverTap}
      >
        <div className="album-cover-flip__inner">
          <div className="album-cover-flip__face album-cover-flip__face--front">
            <AlbumCover {...coverProps} />
          </div>
          <div className="album-cover-flip__face album-cover-flip__face--back" aria-hidden="true">
            <img
              className="album-cover__image album-cover__image--flip-back"
              src={backSrc}
              alt=""
              decoding="async"
              loading="lazy"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(AlbumPageCover);
