import { type RefObject, useEffect } from 'react';

import {
  readMiniPlayerContextMenuAnchor,
  type MiniPlayerContextMenuAnchor,
} from './miniPlayerContextMenuPosition';

/**
 * Keeps context-menu anchor in sync with the live mini-player box while the menu is open.
 */
export function useSyncMiniPlayerContextMenuAnchor(
  miniPlayerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onAnchorChange: (anchor: MiniPlayerContextMenuAnchor) => void
): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const node = miniPlayerRef.current;
    if (!node) {
      return undefined;
    }

    const sync = () => {
      const current = miniPlayerRef.current;
      if (!current?.isConnected) {
        return;
      }
      onAnchorChange(readMiniPlayerContextMenuAnchor(current));
    };

    sync();

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(node);

    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
    };
  }, [isOpen, miniPlayerRef, onAnchorChange]);
}
