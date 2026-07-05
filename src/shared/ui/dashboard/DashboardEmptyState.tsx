import clsx from 'clsx';
import type { ReactNode } from 'react';

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
  const content = (
    <>
      {icon ? <div className="dashboard-empty-state__icon">{icon}</div> : null}
      <h3 className="dashboard-empty-state__title">{title}</h3>
      {description ? (
        <p
          className={clsx(
            'dashboard-empty-state__description',
            descriptionMultiline && 'dashboard-empty-state__description--multiline'
          )}
        >
          {description}
        </p>
      ) : null}
      {action}
    </>
  );

  if (variant === 'tab') {
    return (
      <div
        className={clsx('dashboard-empty-state', 'dashboard-empty-state--tab', className)}
        role="status"
      >
        <div className="dashboard-empty-state__inner--tab">{content}</div>
      </div>
    );
  }

  return (
    <div
      className={clsx('dashboard-empty-state', 'dashboard-empty-state--card', className)}
      role="status"
    >
      {content}
    </div>
  );
}
