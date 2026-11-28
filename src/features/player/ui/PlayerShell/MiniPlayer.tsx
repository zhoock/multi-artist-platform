// src/features/player/ui/PlayerShell/MiniPlayer.tsx
import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { MoreHorizontal, Pause, Play, SkipForward } from 'lucide-react';
import AlbumCover from '@entities/album/ui/AlbumCover';
import {
  playerFilledPlayIconProps,
  playerTransportIconProps,
  PLAYER_MINI_ICON_SIZE,
} from '@shared/ui/icons/playerActionIcon';
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  getPlayerA11yLabels,
  selectPlayerUiForA11y,
} from '@features/player/lib/getPlayerA11yLabels';
import { getMiniPlayerContextMenuLabels } from '@features/player/lib/miniPlayerContextMenuLabels';
import { stripRedundantArtistPrefixFromTrackTitle } from '@features/player/lib/miniPlayerTrackTitle';

import { MiniPlayerScrollingTitle } from './MiniPlayerScrollingTitle';
import './style.scss';

interface ForwardHandlers {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLButtonElement>) => void;
}

interface MiniPlayerProps {
  /** Fallback single-line label when artist metadata is missing. */
  title: string;
  /** Stacked layout: artist on the first line, track on the second. */
  artist?: string | null;
  cover?: string | null;
  userId?: string;
  isPlaying: boolean;
  onToggle: () => void;
  onExpand: () => void;
  forwardHandlers: ForwardHandlers;
  containerRef?: React.Ref<HTMLDivElement>;
  contextMenuButtonRef?: React.Ref<HTMLButtonElement>;
  onOpenContextMenu?: () => void;
  contextMenuOpen?: boolean;
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
  contextMenuButtonRef,
  onOpenContextMenu,
  contextMenuOpen = false,
}) => {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectPlayerUiForA11y(state, lang));
  const labels = useMemo(() => getPlayerA11yLabels(lang, ui), [lang, ui]);
  const contextMenuLabels = useMemo(() => getMiniPlayerContextMenuLabels(lang, ui), [lang, ui]);

  const artistLabel = artist?.trim() ?? '';
  const trackLabel = useMemo(() => {
    const raw = title.trim();
    if (!artistLabel) return raw;
    return stripRedundantArtistPrefixFromTrackTitle(artistLabel, raw);
  }, [artistLabel, title]);
  const showTitleStack = Boolean(artistLabel && trackLabel);
  const hoverTitle = useMemo(() => {
    if (showTitleStack) {
      return `${artistLabel} — ${trackLabel}`;
    }
    return title;
  }, [showTitleStack, artistLabel, trackLabel, title]);

  const handleOpenContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onOpenContextMenu?.();
    },
    [onOpenContextMenu]
  );

  return (
    <div ref={containerRef} className="mini-player" {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}>
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
              size={40}
              densities={[1, 2]}
              sizes="40px"
              imageSource="cdn"
            />
          ) : (
            <div className="mini-player__cover-placeholder" aria-hidden />
          )}
        </div>

        <MiniPlayerScrollingTitle
          hoverTitle={hoverTitle}
          showTitleStack={showTitleStack}
          artistLabel={artistLabel}
          trackLabel={trackLabel}
          compactTitle={title}
        />
      </button>

      <div className="mini-player__controls" aria-label="Управление воспроизведением">
        {onOpenContextMenu ? (
          <button
            ref={contextMenuButtonRef}
            type="button"
            className="mini-player__control mini-player__control--transport"
            onClick={handleOpenContextMenu}
            aria-label={contextMenuLabels.menuLabel}
            aria-haspopup="menu"
            aria-expanded={contextMenuOpen}
          >
            <span className="mini-player__control-glyph" aria-hidden>
              <MoreHorizontal
                {...playerTransportIconProps(PLAYER_MINI_ICON_SIZE, {
                  className: 'mini-player__control-icon',
                })}
              />
            </span>
          </button>
        ) : null}
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
