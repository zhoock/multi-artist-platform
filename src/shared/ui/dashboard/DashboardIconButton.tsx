import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type DashboardIconButtonProps = {
  children: ReactNode;
  destructive?: boolean;
  className?: string;
} & Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled' | 'onClick' | 'type' | 'aria-label' | 'title'
>;

export function DashboardIconButton({
  children,
  destructive = false,
  disabled,
  onClick,
  type = 'button',
  className,
  'aria-label': ariaLabel,
  title,
}: DashboardIconButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'dashboard-icon-button',
        destructive && 'dashboard-icon-button--destructive',
        className
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  );
}
