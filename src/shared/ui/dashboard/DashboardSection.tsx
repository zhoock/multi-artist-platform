import clsx from 'clsx';
import type { ReactNode } from 'react';

type DashboardSectionProps = {
  title: ReactNode;
  headingExtra?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function DashboardSection({
  title,
  headingExtra,
  className,
  children,
}: DashboardSectionProps) {
  return (
    <section className={clsx('dashboard-section', className)}>
      {headingExtra ? (
        <div className="dashboard-section__heading-row">
          <h3 className="dashboard-section__title">{title}</h3>
          {headingExtra}
        </div>
      ) : (
        <h3 className="dashboard-section__title">{title}</h3>
      )}
      {children}
    </section>
  );
}
