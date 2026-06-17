// src/features/player/ui/PlayerShell/MiniPlayer.tsx
import React from 'react';
import clsx from 'clsx';
import { Pause, Play, SkipForward } from 'lucide-react';
import AlbumCover from '@entities/album/ui/AlbumCover';
import {
  playerIconProps,
  playerTransportIconProps,
  PLAYER_MINI_ICON_SIZE,
} from '@shared/ui/icons/playerActionIcon';

import './style.scss';

interface ForwardHandlers {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLButtonElement>) => void;
}

interface MiniPlayerProps {
  title: string;
  cover?: string | null;
  userId?: string;
  isPlaying: boolean;
  onToggle: () => void;
  onExpand: () => void;
  forwardHandlers: ForwardHandlers;
  containerRef?: React.Ref<HTMLDivElement>;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  title,
  cover,
  userId,
  isPlaying,
  onToggle,
  onExpand,
  forwardHandlers,
  containerRef,
}) => {
  return (
    <div
      ref={containerRef}
      className="mini-player"
      role="button"
      tabIndex={0}
      aria-label="Открыть полноэкранный плеер"
      onClick={onExpand}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onExpand();
        }
      }}
    >
      <div className="mini-player__cover">
        {cover ? (
          <AlbumCover
            img={cover}
            userId={userId}
            fullName=""
            size={64}
            densities={[1, 2]}
            sizes="64px"
          />
        ) : (
          <div className="mini-player__cover-placeholder" aria-hidden />
        )}
      </div>

      <div className="mini-player__title" title={title}>
        {title}
      </div>

      <div className="mini-player__controls" aria-label="Управление воспроизведением">
        <button
          type="button"
          className="mini-player__control mini-player__control--transport"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <Pause
              {...playerIconProps(PLAYER_MINI_ICON_SIZE, {
                className: 'mini-player__control-icon',
              })}
            />
          ) : (
            <Play
              {...playerTransportIconProps(PLAYER_MINI_ICON_SIZE, {
                className: clsx('mini-player__control-icon', 'mini-player__control-icon--play'),
              })}
            />
          )}
        </button>
        <button
          type="button"
          className="mini-player__control mini-player__control--transport"
          onMouseDown={(event) => {
            event.stopPropagation();
            forwardHandlers.onMouseDown(event);
          }}
          onMouseUp={(event) => {
            event.stopPropagation();
            forwardHandlers.onMouseUp();
          }}
          onMouseLeave={(event) => {
            event.stopPropagation();
            forwardHandlers.onMouseLeave();
          }}
          onTouchStart={(event) => {
            event.stopPropagation();
            forwardHandlers.onTouchStart(event);
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
            forwardHandlers.onTouchEnd(event);
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label="Следующий трек"
        >
          <SkipForward
            {...playerTransportIconProps(PLAYER_MINI_ICON_SIZE, {
              className: clsx('mini-player__control-icon', 'mini-player__control-icon--forward'),
            })}
          />
        </button>
      </div>
    </div>
  );
};
