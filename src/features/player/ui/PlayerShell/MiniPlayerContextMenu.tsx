import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Disc3, EyeOff, ListPlus, User } from 'lucide-react';

import type { MiniPlayerContextMenuLabels } from '@features/player/lib/miniPlayerContextMenuLabels';
import {
  buildMiniPlayerContextMenuStyle,
  MINI_PLAYER_CONTEXT_MENU_GAP_PX,
  type MiniPlayerContextMenuAnchor,
} from '@features/player/lib/miniPlayerContextMenuPosition';

export type { MiniPlayerContextMenuAnchor };
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';

type MiniPlayerContextMenuProps = {
  open: boolean;
  anchor: MiniPlayerContextMenuAnchor | null;
  labels: MiniPlayerContextMenuLabels;
  albumTitle: string;
  artistTitle: string;
  showAddToCollection: boolean;
  onGoToAlbum: () => void;
  onGoToArtist: () => void;
  onAddToCollection: () => void;
  onHideMiniPlayer: () => void;
  canGoToAlbum: boolean;
  canGoToArtist: boolean;
};

function MenuSeparator() {
  return <div className="mini-player-context-menu__separator" role="separator" />;
}

export const MiniPlayerContextMenu: React.FC<MiniPlayerContextMenuProps> = ({
  open,
  anchor,
  labels,
  albumTitle,
  artistTitle,
  showAddToCollection,
  onGoToAlbum,
  onGoToArtist,
  onAddToCollection,
  onHideMiniPlayer,
  canGoToAlbum,
  canGoToArtist,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setMenuStyle(null);
      return;
    }

    const applyPosition = () => {
      const menuNode = menuRef.current;
      if (!menuNode) return;
      const menuRect = menuNode.getBoundingClientRect();
      setMenuStyle(
        buildMiniPlayerContextMenuStyle(
          anchor,
          { width: menuRect.width, height: menuRect.height },
          { width: window.innerWidth, height: window.innerHeight },
          { placement: 'above', gap: MINI_PLAYER_CONTEXT_MENU_GAP_PX }
        )
      );
    };

    applyPosition();

    const menuNode = menuRef.current;
    if (!menuNode) return undefined;

    const menuResizeObserver = new ResizeObserver(applyPosition);
    menuResizeObserver.observe(menuNode);
    window.addEventListener('resize', applyPosition);
    window.visualViewport?.addEventListener('resize', applyPosition);

    return () => {
      menuResizeObserver.disconnect();
      window.removeEventListener('resize', applyPosition);
      window.visualViewport?.removeEventListener('resize', applyPosition);
    };
  }, [
    open,
    anchor,
    showAddToCollection,
    albumTitle,
    artistTitle,
    labels,
    canGoToAlbum,
    canGoToArtist,
  ]);

  if (!open || !anchor || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="mini-player-context-menu"
      role="menu"
      aria-label={labels.menuLabel}
      style={{
        visibility: menuStyle ? 'visible' : 'hidden',
        ...(menuStyle ??
          buildMiniPlayerContextMenuStyle(
            anchor,
            { width: 0, height: 0 },
            { width: window.innerWidth, height: window.innerHeight },
            { placement: 'above', gap: MINI_PLAYER_CONTEXT_MENU_GAP_PX }
          )),
      }}
      {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}
    >
      <button
        type="button"
        role="menuitem"
        className="mini-player-context-menu__item"
        disabled={!canGoToAlbum}
        onClick={onGoToAlbum}
      >
        <Disc3
          className="mini-player-context-menu__icon"
          size={18}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="mini-player-context-menu__text">
          <span className="mini-player-context-menu__title">{labels.goToAlbum}</span>
          {albumTitle ? (
            <span className="mini-player-context-menu__subtitle">{albumTitle}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="mini-player-context-menu__item"
        disabled={!canGoToArtist}
        onClick={onGoToArtist}
      >
        <User className="mini-player-context-menu__icon" size={18} strokeWidth={1.75} aria-hidden />
        <span className="mini-player-context-menu__text">
          <span className="mini-player-context-menu__title">{labels.goToArtist}</span>
          {artistTitle ? (
            <span className="mini-player-context-menu__subtitle">{artistTitle}</span>
          ) : null}
        </span>
      </button>
      {showAddToCollection ? (
        <>
          <MenuSeparator />
          <button
            type="button"
            role="menuitem"
            className="mini-player-context-menu__item"
            onClick={onAddToCollection}
          >
            <ListPlus
              className="mini-player-context-menu__icon"
              size={18}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="mini-player-context-menu__title">{labels.addToCollection}</span>
          </button>
        </>
      ) : null}
      <MenuSeparator />
      <button
        type="button"
        role="menuitem"
        className={clsx('mini-player-context-menu__item', 'mini-player-context-menu__item--danger')}
        onClick={onHideMiniPlayer}
      >
        <EyeOff
          className="mini-player-context-menu__icon"
          size={18}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="mini-player-context-menu__title">{labels.hideMiniPlayer}</span>
      </button>
    </div>,
    document.body
  );
};
