import type { CSSProperties } from 'react';
import clsx from 'clsx';

import { useMiniPlayerTitleMarquee } from '@features/player/lib/useMiniPlayerTitleMarquee';

type MiniPlayerScrollingTitleProps = {
  hoverTitle: string;
  showTitleStack: boolean;
  artistLabel: string;
  trackLabel: string;
  compactTitle: string;
};

type TitleSegmentProps = {
  showTitleStack: boolean;
  compactTitle: string;
  artistLabel: string;
  trackLabel: string;
  registerLineRef: (index: number) => (node: HTMLSpanElement | null) => void;
};

function MiniPlayerTitleSegment({
  showTitleStack,
  compactTitle,
  artistLabel,
  trackLabel,
  registerLineRef,
}: TitleSegmentProps) {
  return (
    <>
      <span
        className="mini-player__title-line mini-player__title-line--compact"
        ref={registerLineRef(0)}
      >
        {compactTitle}
      </span>
      {showTitleStack ? (
        <span className="mini-player__title-stack">
          <span
            className="mini-player__title-line mini-player__title-line--artist"
            ref={registerLineRef(1)}
          >
            {artistLabel}
          </span>
          <span
            className="mini-player__title-line mini-player__title-line--track"
            ref={registerLineRef(2)}
          >
            {trackLabel}
          </span>
        </span>
      ) : null}
    </>
  );
}

export function MiniPlayerScrollingTitle({
  hoverTitle,
  showTitleStack,
  artistLabel,
  trackLabel,
  compactTitle,
}: MiniPlayerScrollingTitleProps) {
  const contentKey = showTitleStack ? `${artistLabel}\u0000${trackLabel}` : compactTitle.trim();

  const { viewportRef, segmentRef, registerLineRef, marquee } =
    useMiniPlayerTitleMarquee(contentKey);

  const trackStyle = marquee.active
    ? ({
        '--mini-player-title-marquee-distance': `${marquee.loopDistancePx}px`,
        '--mini-player-title-marquee-duration': `${marquee.durationSec}s`,
      } as CSSProperties)
    : undefined;

  return (
    <span className="mini-player__title" title={hoverTitle}>
      <span
        ref={viewportRef}
        className={clsx(
          'mini-player__title-viewport',
          marquee.active && 'mini-player__title-viewport--marquee'
        )}
      >
        <span
          className={clsx(
            'mini-player__title-marquee',
            marquee.active && 'mini-player__title-marquee--active'
          )}
        >
          <span
            key={contentKey}
            className={clsx(
              'mini-player__title-marquee-track',
              marquee.active && 'mini-player__title-marquee-track--active'
            )}
            style={trackStyle}
          >
            <span ref={segmentRef} className="mini-player__title-marquee-segment">
              <MiniPlayerTitleSegment
                showTitleStack={showTitleStack}
                compactTitle={compactTitle}
                artistLabel={artistLabel}
                trackLabel={trackLabel}
                registerLineRef={registerLineRef}
              />
            </span>
            {marquee.active ? (
              <span className="mini-player__title-marquee-segment" aria-hidden="true">
                <MiniPlayerTitleSegment
                  showTitleStack={showTitleStack}
                  compactTitle={compactTitle}
                  artistLabel={artistLabel}
                  trackLabel={trackLabel}
                  registerLineRef={() => () => undefined}
                />
              </span>
            ) : null}
          </span>
        </span>
      </span>
    </span>
  );
}
