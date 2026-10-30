// src/features/player/ui/PlayerShell/MiniPlayer.tsx
import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Pause, Play, SkipForward, SlidersHorizontal } from 'lucide-react';
import AlbumCover from '@entities/album/ui/AlbumCover';
import {
  playerFilledPlayIconProps,
  playerTransportIconProps,
  playerIconProps,
  PLAYER_MINI_ICON_SIZE,
} from '@shared/ui/icons/playerActionIcon';
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  getPlayerA11yLabels,
  selectPlayerUiForA11y,
} from '@features/player/lib/getPlayerA11yLabels';
import { stripRedundantArtistPrefixFromTrackTitle } from '@features/player/lib/miniPlayerTrackTitle';

import './style.scss';

interface ForwardHandlers {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLButtonElement>) => void;
}

interface MiniPlayerProps {
  /** Desktop single-line label (current track title). */
  title: string;
  /** Mobile stacked layout: artist on the first line. */
  artist?: string | null;
  cover?: string | null;
  userId?: string;
  isPlaying: boolean;
  onToggle: () => void;
  onExpand: () => void;
  forwardHandlers: ForwardHandlers;
  containerRef?: React.Ref<HTMLDivElement>;
  showMixerButton?: boolean;
  onOpenMixer?: () => void;
  openMixerLabel?: string;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  title,
  artist,
  cover,
  userId,
  isPlaying,
  onToggle,
  onExpand,
  forwardHandlers,
  containerRef,
  showMixerButton = false,
  onOpenMixer,
  openMixerLabel,
}) => {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectPlayerUiForA11y(state, lang));
  const labels = useMemo(() => getPlayerA11yLabels(lang, ui), [lang, ui]);

  const artistLabel = artist?.trim() ?? '';
  const trackLabel = useMemo(() => {
    const raw = title.trim();
    if (!artistLabel) return raw;
    return stripRedundantArtistPrefixFromTrackTitle(artistLabel, raw);
  }, [artistLabel, title]);
  const showMobileStack = Boolean(artistLabel && trackLabel);
  const hoverTitle = useMemo(() => {
    if (showMobileStack) {
      return `${artistLabel} — ${trackLabel}`;
    }
    return title;
  }, [showMobileStack, artistLabel, trackLabel, title]);

  return (
    <div ref={containerRef} className="mini-player" {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}>
      {showMixerButton && onOpenMixer ? (
        <button
          type="button"
          className="mini-player__mixer"
          aria-label={openMixerLabel ?? labels.openMixer}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMixer();
          }}
        >
          <SlidersHorizontal
            {...playerIconProps(PLAYER_MINI_ICON_SIZE, {
              className: 'mini-player__mixer-icon',
            })}
          />
        </button>
      ) : null}
      <button
        type="button"
        className="mini-player__expand"
        aria-label={labels.openFullPlayer}
        onClick={onExpand}
      >
        <div className="mini-player__cover">
          {cover ? (
            <AlbumCover
              img={cover}
              userId={userId}
              fullName=""
              size={64}
              densities={[1, 2]}
              sizes="(max-width: 767px) 40px, 64px"
              imageSource="cdn"
            />
          ) : (
            <div className="mini-player__cover-placeholder" aria-hidden />
          )}
        </div>

        <span className="mini-player__title" title={hoverTitle}>
          <span className="mini-player__title-line mini-player__title-line--compact">{title}</span>
          {showMobileStack ? (
            <span className="mini-player__title-stack">
              <span className="mini-player__title-line mini-player__title-line--artist">
                {artistLabel}
              </span>
              <span className="mini-player__title-line mini-player__title-line--track">
                {trackLabel}
              </span>
            </span>
          ) : null}
        </span>
      </button>

      <div className="mini-player__controls" aria-label="Управление воспроизведением">
        <button
          type="button"
          className="mini-player__control mini-player__control--transport"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={isPlaying ? labels.pause : labels.play}
        >
          {isPlaying ? (
            <span className="mini-player__control-glyph" aria-hidden>
              <Pause
                {...playerTransportIconProps(PLAYER_MINI_ICON_SIZE, {
                  className: 'mini-player__control-icon',
                })}
              />
            </span>
          ) : (
            <span className="mini-player__control-glyph" aria-hidden>
              <Play
                {...playerFilledPlayIconProps(PLAYER_MINI_ICON_SIZE, {
                  className: 'mini-player__control-icon mini-player__control-icon--play',
                })}
              />
            </span>
          )}
        </button>
        <button
          type="button"
          className="mini-player__control mini-player__control--transport"
          onMouseDown={forwardHandlers.onMouseDown}
          onMouseUp={forwardHandlers.onMouseUp}
          onMouseLeave={forwardHandlers.onMouseLeave}
          onTouchStart={forwardHandlers.onTouchStart}
          onTouchEnd={forwardHandlers.onTouchEnd}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label={labels.nextTrack}
        >
          <SkipForward
            {...playerTransportIconProps(PLAYER_MINI_ICON_SIZE, {
              className: clsx('mini-player__control-icon', 'mini-player__control-icon--forward'),
            })}
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
};
