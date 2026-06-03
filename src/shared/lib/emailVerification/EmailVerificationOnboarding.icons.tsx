import { Lock as LockLucideIcon, Send as SendLucideIcon } from 'lucide-react';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

export function LockIcon({ className }: { className?: string }) {
  return (
    <LockLucideIcon
      {...dashboardActionIconProps({
        size: 28,
        strokeWidth: 1.5,
        className,
      })}
    />
  );
}

export function SendIcon({ className }: { className?: string }) {
  return (
    <SendLucideIcon
      {...dashboardActionIconProps({
        size: 18,
        strokeWidth: 1.5,
        className,
      })}
    />
  );
}
