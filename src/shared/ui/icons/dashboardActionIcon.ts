import type { LucideProps } from 'lucide-react';

/** Shared size for dashboard row / toolbar action icons (Edit, Delete, Open page, etc.). */
export const DASHBOARD_ACTION_ICON_SIZE = 18;

export const DASHBOARD_ACTION_ICON_STROKE_WIDTH = 2;

export function dashboardActionIconProps(overrides?: Partial<LucideProps>): LucideProps {
  return {
    size: DASHBOARD_ACTION_ICON_SIZE,
    strokeWidth: DASHBOARD_ACTION_ICON_STROKE_WIDTH,
    'aria-hidden': true,
    ...overrides,
  };
}
