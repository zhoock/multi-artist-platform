import { Info as InfoIcon } from 'lucide-react';

import { dashboardActionIconProps } from './dashboardActionIcon';

export function InfoCircleIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return <InfoIcon {...dashboardActionIconProps({ size, className })} />;
}
