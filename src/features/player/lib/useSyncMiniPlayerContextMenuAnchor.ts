import { type RefObject, useEffect } from 'react';

import {
  readMiniPlayerContextMenuAnchor,
  type MiniPlayerContextMenuAnchor,
} from './miniPlayerContextMenuPosition';

/** Keeps context-menu anchor in sync with its trigger while the menu is open. */
export function useSyncMiniPlayerContextMenuAnchor(
  anchorRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onAnchorChange: (anchor: MiniPlayerContextMenuAnchor) => void
): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const node = anchorRef.current;
    if (!node) {
      return undefined;
    }

    const sync = () => {
      const current = anchorRef.current;
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
  }, [isOpen, anchorRef, onAnchorChange]);
}
