import type { CSSProperties } from 'react';

import { DASHBOARD_ACCESS_MENU_Z_INDEX } from './useDashboardAccessMenu';

export const EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX = 8;
export const EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX = 8;

export type EditArticleVkPlusMenuPlacement = 'below' | 'above';

export type EditArticleVkPlusMenuSize = {
  width: number;
  height: number;
};

export type EditArticleVkPlusMenuStyleResult = {
  style: CSSProperties;
  placement: EditArticleVkPlusMenuPlacement;
};

export type EditArticleVkPlusMenuViewport = {
  width: number;
  height: number;
};

export type EditArticleVkPlusMenuVerticalBounds = {
  minTop: number;
  maxBottom: number;
};

/** Keeps portaled menu intrinsic-sized (overrides dashboard dialog `> *` shell rules). */
const COMPACT_PORTAL_MENU_SIZING: CSSProperties = {
  width: 'max-content',
  height: 'max-content',
  minWidth: 0,
  minHeight: 0,
  maxWidth: 'none',
  maxHeight: 'none',
};

const HIDDEN_MENU_STYLE: CSSProperties = {
  position: 'fixed',
  visibility: 'hidden',
  zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
  ...COMPACT_PORTAL_MENU_SIZING,
};

export function resolveEditArticleVkPlusMenuVerticalBounds(
  trigger: HTMLElement | null,
  viewport: EditArticleVkPlusMenuViewport
): EditArticleVkPlusMenuVerticalBounds {
  const margin = EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX;
  const gap = EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX;

  let minTop = margin;
  let maxBottom = viewport.height - margin;

  if (!trigger) {
    return { minTop, maxBottom };
  }

  const dialog =
    (trigger.closest('dialog.popup') as HTMLElement | null) ??
    (trigger.closest('dialog') as HTMLElement | null);

  if (dialog) {
    const header = dialog.querySelector('.edit-article-v2__header') as HTMLElement | null;
    if (header) {
      const headerBottom = header.getBoundingClientRect().bottom;
      if (Number.isFinite(headerBottom)) {
        minTop = Math.max(minTop, headerBottom + margin);
      }
    }

    const footer = dialog.querySelector('.edit-article-v2__footer') as HTMLElement | null;
    if (footer) {
      const footerTop = footer.getBoundingClientRect().top;
      if (Number.isFinite(footerTop)) {
        maxBottom = Math.min(maxBottom, footerTop - gap);
      }
    }
  }

  if (maxBottom < minTop + gap) {
    maxBottom = minTop + gap;
  }

  return { minTop, maxBottom };
}

export function getEditArticleVkPlusMenuStyle(
  trigger: HTMLElement | null,
  menuSize: EditArticleVkPlusMenuSize | null,
  viewport: EditArticleVkPlusMenuViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
): EditArticleVkPlusMenuStyleResult {
  if (!trigger || !menuSize || menuSize.width <= 0 || menuSize.height <= 0) {
    return { style: HIDDEN_MENU_STYLE, placement: 'below' };
  }

  const rect = trigger.getBoundingClientRect();
  const gap = EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX;
  const margin = EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX;
  const { minTop, maxBottom } = resolveEditArticleVkPlusMenuVerticalBounds(trigger, viewport);

  const spaceBelow = maxBottom - rect.bottom - gap;
  const spaceAbove = rect.top - gap - minTop;

  const fitsBelow = spaceBelow >= menuSize.height;
  const fitsAbove = spaceAbove >= menuSize.height;
  const openBelow = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);
  const placement: EditArticleVkPlusMenuPlacement = openBelow ? 'below' : 'above';

  let top = openBelow ? rect.bottom + gap : rect.top - gap - menuSize.height;
  top = Math.min(Math.max(minTop, top), maxBottom - menuSize.height);

  let left = rect.left;
  left = Math.min(Math.max(margin, left), viewport.width - margin - menuSize.width);

  return {
    style: {
      position: 'fixed',
      top,
      left,
      zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
      visibility: 'visible',
      ...COMPACT_PORTAL_MENU_SIZING,
    },
    placement,
  };
}
