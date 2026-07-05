import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type DashboardActionProps = {
  children: ReactNode;
  destructive?: boolean;
  className?: string;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'onClick' | 'type' | 'aria-label'>;

export function DashboardAction({
  children,
  destructive = false,
  disabled,
  onClick,
  type = 'button',
  className,
  'aria-label': ariaLabel,
}: DashboardActionProps) {
  return (
    <button
      type={type}
      className={clsx(
        'dashboard-action',
        destructive && 'dashboard-action--destructive',
        className
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
