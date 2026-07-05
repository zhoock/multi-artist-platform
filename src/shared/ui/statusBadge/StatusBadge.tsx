import clsx from 'clsx';
import type { ReactNode } from 'react';

import './style.scss';

export type StatusBadgeVariant =
  | 'public'
  | 'private'
  | 'draft'
  | 'readyToPublish'
  | 'published'
  | 'notVerified'
  | 'locked'
  | 'inactive';

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  public: 'status-badge--public',
  private: 'status-badge--private',
  draft: 'status-badge--draft',
  readyToPublish: 'status-badge--ready-to-publish',
  published: 'status-badge--published',
  notVerified: 'status-badge--not-verified',
  locked: 'status-badge--locked',
  inactive: 'status-badge--inactive',
};

type StatusBadgeProps = {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={clsx('status-badge', VARIANT_CLASS[variant], className)}>
      <span className="status-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
