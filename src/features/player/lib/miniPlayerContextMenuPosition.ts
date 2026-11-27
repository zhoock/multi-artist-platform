import type { CSSProperties } from 'react';

export type MiniPlayerContextMenuAnchor = {
  left: number;
  top: number;
  bottom: number;
  width: number;
};

export const MINI_PLAYER_CONTEXT_MENU_GAP_PX = 8;
const VIEWPORT_EDGE_PADDING_PX = MINI_PLAYER_CONTEXT_MENU_GAP_PX;

export type MiniPlayerContextMenuPlacement = 'above' | 'auto';

export function readMiniPlayerContextMenuAnchor(node: HTMLElement): MiniPlayerContextMenuAnchor {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
  };
}

export function clampMiniPlayerContextMenuLeft(
  preferredLeft: number,
  menuWidth: number,
  viewportWidth: number,
  padding = VIEWPORT_EDGE_PADDING_PX
): number {
  if (!Number.isFinite(menuWidth) || menuWidth <= 0) {
    return Math.max(padding, preferredLeft);
  }
  const maxLeft = Math.max(padding, viewportWidth - padding - menuWidth);
  return Math.max(padding, Math.min(preferredLeft, maxLeft));
}

export function buildMiniPlayerContextMenuStyle(
  anchor: MiniPlayerContextMenuAnchor,
  menuSize: { width: number; height: number },
  viewport = typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 0, height: 0 },
  options: { placement?: MiniPlayerContextMenuPlacement; gap?: number } = {}
): CSSProperties {
  const gap = options.gap ?? VIEWPORT_EDGE_PADDING_PX;
  const placement = options.placement ?? 'auto';
  const menuWidth = Math.max(menuSize.width, 0);
  const preferredLeft =
    menuWidth > 0 ? anchor.left + anchor.width / 2 - menuWidth / 2 : anchor.left;
  const left = clampMiniPlayerContextMenuLeft(
    preferredLeft,
    menuWidth,
    viewport.width,
    VIEWPORT_EDGE_PADDING_PX
  );

  const spaceAbove = anchor.top - gap;
  const spaceBelow = viewport.height - anchor.bottom - gap;
  const preferAbove =
    placement === 'above' ||
    menuSize.height <= 0 ||
    spaceAbove >= menuSize.height ||
    spaceAbove >= spaceBelow;

  if (preferAbove) {
    return {
      left,
      bottom: `calc(100vh - ${anchor.top}px + ${gap}px)`,
      top: 'auto',
    };
  }

  return {
    left,
    top: anchor.bottom + gap,
    bottom: 'auto',
  };
}
