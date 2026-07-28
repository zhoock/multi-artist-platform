import clsx from 'clsx';
import type { ReactNode } from 'react';

import { DashboardButton } from '@shared/ui/dashboard';

export type EmptyStateTone = 'default' | 'warning' | 'success';
export type EmptyStateLayout = 'tab' | 'card' | 'inline';

export type EmptyStateAction = {
  label: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'outline';
};

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** @deprecated Prefer primaryAction / secondaryAction */
  action?: ReactNode;
  tone?: EmptyStateTone;
  layout?: EmptyStateLayout;
  className?: string;
  descriptionMultiline?: boolean;
  actionsVariant?: 'dashboard' | 'plain';
};

function renderConfiguredAction(
  action: EmptyStateAction,
  actionsVariant: 'dashboard' | 'plain',
  fallbackVariant: 'primary' | 'outline'
) {
  const variant = action.variant ?? fallbackVariant;

  if (actionsVariant === 'dashboard') {
    return (
      <DashboardButton
        variant={variant === 'primary' ? 'primary' : 'outline'}
        onClick={action.onClick}
      >
        {action.icon}
        <span>{action.label}</span>
      </DashboardButton>
    );
  }

  return (
    <button
      type="button"
      className={clsx(
        'empty-state__action',
        variant === 'primary' ? 'empty-state__action--primary' : 'empty-state__action--outline'
      )}
      onClick={action.onClick}
    >
      {action.icon ? <span className="empty-state__action-icon">{action.icon}</span> : null}
      <span>{action.label}</span>
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  action,
  tone = 'default',
  layout = 'inline',
  className,
  descriptionMultiline = false,
  actionsVariant = 'dashboard',
}: EmptyStateProps) {
  const hasConfiguredActions = Boolean(primaryAction || secondaryAction);
  const titleClassName = clsx(
    'empty-state__title',
    layout === 'tab' && 'empty-state__title--heading'
  );

  const content = (
    <>
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      {layout === 'tab' ? (
        <h3 className={titleClassName}>{title}</h3>
      ) : (
        <p className={titleClassName}>{title}</p>
      )}
      {description ? (
        <p
          className={clsx(
            'empty-state__description',
            descriptionMultiline && 'empty-state__description--multiline'
          )}
        >
          {description}
        </p>
      ) : null}
      {action}
      {hasConfiguredActions ? (
        <div className="empty-state__actions">
          {primaryAction ? renderConfiguredAction(primaryAction, actionsVariant, 'primary') : null}
          {secondaryAction
            ? renderConfiguredAction(secondaryAction, actionsVariant, 'outline')
            : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={clsx('empty-state', `empty-state--${layout}`, `empty-state--${tone}`, className)}
      role="status"
    >
      {layout === 'tab' ? <div className="empty-state__inner--tab">{content}</div> : content}
    </div>
  );
}
