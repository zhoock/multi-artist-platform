import clsx from 'clsx';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';

type DashboardCtaProps<T extends ElementType = 'button'> = {
  as?: T;
  children: ReactNode;
  className?: string;
  loading?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className' | 'loading'>;

export function DashboardCta<T extends ElementType = 'button'>({
  as,
  children,
  className,
  loading = false,
  ...rest
}: DashboardCtaProps<T>) {
  const Component = (as ?? 'button') as ElementType;
  const isButton = Component === 'button';
  const buttonProps = isButton
    ? { type: ((rest as { type?: string }).type ?? 'button') as 'button' | 'submit' | 'reset' }
    : {};

  return (
    <Component
      {...rest}
      {...buttonProps}
      className={clsx('dashboard-cta', loading && 'dashboard-cta--loading', className)}
    >
      {loading ? <DashboardSaveSpinner /> : null}
      {children}
    </Component>
  );
}
