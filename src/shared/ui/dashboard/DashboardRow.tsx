import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export type DashboardRowVariant = 'default' | 'start' | 'action';

type DashboardRowProps = {
  label: ReactNode;
  labelFor?: string;
  variant?: DashboardRowVariant;
  className?: string;
  children: ReactNode;
  action?: ReactNode;
};

function renderLabel(label: ReactNode, labelFor?: string) {
  if (labelFor) {
    return (
      <label htmlFor={labelFor} className="dashboard-row__label">
        {label}
      </label>
    );
  }

  if (typeof label === 'string') {
    return <p className="dashboard-row__label">{label}</p>;
  }

  return label;
}

export function DashboardRow({
  label,
  labelFor,
  variant = 'default',
  className,
  children,
  action,
}: DashboardRowProps) {
  return (
    <div
      className={clsx(
        'dashboard-row',
        variant !== 'default' && `dashboard-row--${variant}`,
        className
      )}
    >
      {renderLabel(label, labelFor)}
      <div className="dashboard-row__control">{children}</div>
      {action}
    </div>
  );
}

type DashboardRowValueProps = HTMLAttributes<HTMLParagraphElement>;

export function DashboardRowValue({ className, children, ...props }: DashboardRowValueProps) {
  return (
    <p className={clsx('dashboard-row__value', className)} {...props}>
      {children}
    </p>
  );
}

type DashboardRowValueWrapProps = HTMLAttributes<HTMLDivElement>;

export function DashboardRowValueWrap({
  className,
  children,
  ...props
}: DashboardRowValueWrapProps) {
  return (
    <div className={clsx('dashboard-row__value-wrap', className)} {...props}>
      {children}
    </div>
  );
}

type DashboardRowInlineErrorProps = HTMLAttributes<HTMLParagraphElement>;

export function DashboardRowInlineError({
  className,
  children,
  ...props
}: DashboardRowInlineErrorProps) {
  return (
    <p className={clsx('dashboard-row__inline-error', className)} role="alert" {...props}>
      {children}
    </p>
  );
}
