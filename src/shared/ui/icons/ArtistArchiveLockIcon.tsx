import { LockOpen as LockOpenIcon } from 'lucide-react';

import { dashboardActionIconProps } from './dashboardActionIcon';

/** Open lock — archive gate for locked artist content (articles, etc.). */
export function ArtistArchiveLockIcon({
  className,
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <LockOpenIcon
      {...dashboardActionIconProps({
        size,
        strokeWidth: 1.75,
        className,
      })}
    />
  );
}
