import clsx from 'clsx';
import type { ReactNode } from 'react';

import { EmptyState, type EmptyStateLayout } from '@shared/ui/emptyState';

type DashboardEmptyStateVariant = 'tab' | 'card';

type DashboardEmptyStateProps = {
  variant: DashboardEmptyStateVariant;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  descriptionMultiline?: boolean;
};

export function DashboardEmptyState({
  variant,
  icon,
  title,
  description,
  action,
  className,
  descriptionMultiline = false,
}: DashboardEmptyStateProps) {
  const layout: EmptyStateLayout = variant;

  return (
    <EmptyState
      layout={layout}
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={clsx(
        className,
        'dashboard-empty-state',
        variant === 'tab' ? 'dashboard-empty-state--tab' : 'dashboard-empty-state--card'
      )}
      descriptionMultiline={descriptionMultiline}
      actionsVariant="dashboard"
    />
  );
}
