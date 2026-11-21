import type { CSSProperties } from 'react';

export type MiniPlayerContextMenuAnchor = {
  left: number;
  top: number;
  bottom: number;
  width: number;
};

const VIEWPORT_EDGE_PADDING_PX = 8;

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
    : { width: 0, height: 0 }
): CSSProperties {
  const gap = VIEWPORT_EDGE_PADDING_PX;
  const minWidth = Math.min(anchor.width, 320);
  const widthForClamp = Math.max(menuSize.width, minWidth);
  const left = clampMiniPlayerContextMenuLeft(anchor.left, widthForClamp, viewport.width);

  const spaceAbove = anchor.top - gap;
  const spaceBelow = viewport.height - anchor.bottom - gap;
  const preferAbove =
    menuSize.height <= 0 || spaceAbove >= menuSize.height || spaceAbove >= spaceBelow;

  if (preferAbove) {
    return {
      left,
      bottom: `calc(100vh - ${anchor.top}px + var(--ms-01, 8px))`,
      top: 'auto',
      minWidth,
    };
  }

  return {
    left,
    top: anchor.bottom + gap,
    bottom: 'auto',
    minWidth,
  };
}
