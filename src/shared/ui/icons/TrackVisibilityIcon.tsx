import clsx from 'clsx';
import {
  Globe as GlobeIcon,
  GlobeOff as GlobeOffIcon,
  Lock as LockIcon,
  type LucideIcon,
} from 'lucide-react';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';

import { dashboardActionIconProps } from './dashboardActionIcon';

const VISIBILITY_ICONS: Record<TrackVisibility, LucideIcon> = {
  public: GlobeIcon,
  subscribers_only: LockIcon,
  hidden: GlobeOffIcon,
};

export function TrackVisibilityIcon({
  visibility,
  className,
  size = 20,
}: {
  visibility: TrackVisibility;
  className?: string;
  size?: number;
}) {
  const Icon = VISIBILITY_ICONS[visibility];
  const iconClass = clsx(
    'track-visibility-icon',
    `track-visibility-icon--${visibility}`,
    className
  );

  return <Icon {...dashboardActionIconProps({ size, className: iconClass })} />;
}
