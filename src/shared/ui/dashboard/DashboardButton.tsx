import clsx from 'clsx';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';

export type DashboardButtonVariant = 'primary' | 'outline' | 'icon';

type DashboardButtonProps<T extends ElementType = 'button'> = {
  as?: T;
  variant: DashboardButtonVariant;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  destructive?: boolean;
} & Omit<
  ComponentPropsWithoutRef<T>,
  'as' | 'children' | 'className' | 'variant' | 'loading' | 'destructive'
>;

export function DashboardButton<T extends ElementType = 'button'>({
  as,
  variant,
  children,
  className,
  loading = false,
  destructive = false,
  ...rest
}: DashboardButtonProps<T>) {
  const Component = (as ?? 'button') as ElementType;
  const isButton = Component === 'button';
  const buttonProps = isButton
    ? { type: ((rest as { type?: string }).type ?? 'button') as 'button' | 'submit' | 'reset' }
    : {};

  return (
    <Component
      {...rest}
      {...buttonProps}
      className={clsx(
        'dashboard-button',
        `dashboard-button--${variant}`,
        variant === 'primary' && loading && 'dashboard-button--loading',
        destructive && 'dashboard-button--destructive',
        className
      )}
    >
      {variant === 'primary' && loading ? <DashboardSaveSpinner /> : null}
      {children}
    </Component>
  );
}
