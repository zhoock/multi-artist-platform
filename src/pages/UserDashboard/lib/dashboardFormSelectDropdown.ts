import type { CSSProperties } from 'react';

import { DASHBOARD_ACCESS_MENU_Z_INDEX } from './useDashboardAccessMenu';

export const DASHBOARD_FORM_SELECT_DROPDOWN_GAP_PX = 4;
export const DASHBOARD_FORM_SELECT_DROPDOWN_VIEWPORT_MARGIN_PX = 8;
export const DASHBOARD_FORM_SELECT_DROPDOWN_MAX_HEIGHT_PX = 320;

export function getDashboardFormSelectDropdownStyle(trigger: HTMLElement | null): CSSProperties {
  if (!trigger) {
    return { position: 'fixed', visibility: 'hidden' };
  }

  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow =
    viewportHeight -
    rect.bottom -
    DASHBOARD_FORM_SELECT_DROPDOWN_GAP_PX -
    DASHBOARD_FORM_SELECT_DROPDOWN_VIEWPORT_MARGIN_PX;
  const spaceAbove =
    rect.top -
    DASHBOARD_FORM_SELECT_DROPDOWN_GAP_PX -
    DASHBOARD_FORM_SELECT_DROPDOWN_VIEWPORT_MARGIN_PX;

  const openBelow = spaceBelow >= spaceAbove || spaceBelow >= 160;
  const maxHeight = Math.min(
    DASHBOARD_FORM_SELECT_DROPDOWN_MAX_HEIGHT_PX,
    Math.max(0, openBelow ? spaceBelow : spaceAbove)
  );

  if (openBelow) {
    return {
      position: 'fixed',
      top: rect.bottom + DASHBOARD_FORM_SELECT_DROPDOWN_GAP_PX,
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
    };
  }

  return {
    position: 'fixed',
    left: rect.left,
    width: rect.width,
    bottom: viewportHeight - rect.top + DASHBOARD_FORM_SELECT_DROPDOWN_GAP_PX,
    maxHeight,
    zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
  };
}
