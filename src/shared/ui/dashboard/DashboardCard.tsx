import clsx from 'clsx';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';

type DashboardCardProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  as?: 'div' | 'article';
} & Omit<HTMLAttributes<HTMLElement>, 'className'>;

export function DashboardCard({
  children,
  className,
  interactive = false,
  selected = false,
  disabled = false,
  as: Tag = 'div',
  ...rest
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
      {...rest}
    >
      {children}
    </Component>
  );
}
