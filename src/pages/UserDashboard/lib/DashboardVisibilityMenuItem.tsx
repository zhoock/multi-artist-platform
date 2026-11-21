import React from 'react';
import clsx from 'clsx';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';

export type DashboardVisibilityMenuItemProps = {
  visibility: TrackVisibility;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function DashboardVisibilityMenuItem({
  visibility,
  label,
  description,
  selected,
  onSelect,
  onClick,
}: DashboardVisibilityMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={clsx('user-dashboard__track-access-menu-item', {
        'user-dashboard__track-access-menu-item--active': selected,
      })}
      onClick={(event) => {
        onClick?.(event);
        onSelect();
      }}
    >
      <span className="user-dashboard__track-access-menu-item-icon" aria-hidden>
        <TrackVisibilityIcon visibility={visibility} size={18} />
      </span>
      <span className="user-dashboard__track-access-menu-item-text">
        <span className="user-dashboard__track-access-menu-item-title">{label}</span>
        <span className="user-dashboard__track-access-menu-item-desc">{description}</span>
      </span>
      {selected ? (
        <span className="user-dashboard__track-access-menu-state-dot" aria-hidden />
      ) : null}
    </button>
  );
}
