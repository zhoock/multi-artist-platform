import { Lock as LockIcon } from 'lucide-react';

import { dashboardActionIconProps } from './dashboardActionIcon';

/** Locked subscriber / premium content (articles, tracks, archive CTA). */
export function SubscriberContentLockIcon({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <LockIcon
      {...dashboardActionIconProps({
        size,
        strokeWidth: 1.6,
        className,
      })}
    />
  );
}
