import clsx from 'clsx';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';

type DashboardExpandableRowTriggerProps = {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
} & Pick<HTMLAttributes<HTMLDivElement>, 'id' | 'aria-label'>;

export function DashboardExpandableRowTrigger({
  expanded,
  onToggle,
  children,
  className,
  id,
  'aria-label': ariaLabel,
}: DashboardExpandableRowTriggerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      id={id}
      className={clsx('dashboard-expandable-row-trigger', className)}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
