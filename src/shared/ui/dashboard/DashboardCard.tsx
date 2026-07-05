import clsx from 'clsx';
import type { ElementType, ReactNode } from 'react';

type DashboardCardProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  as?: 'div' | 'article';
};

export function DashboardCard({
  children,
  className,
  interactive = false,
  selected = false,
  disabled = false,
  as: Tag = 'div',
}: DashboardCardProps) {
  const Component = Tag as ElementType;

  return (
    <Component
      className={clsx(
        'dashboard-card',
        interactive && 'dashboard-card--interactive',
        selected && 'dashboard-card--selected',
        disabled && 'dashboard-card--disabled',
        className
      )}
    >
      {children}
    </Component>
  );
}
