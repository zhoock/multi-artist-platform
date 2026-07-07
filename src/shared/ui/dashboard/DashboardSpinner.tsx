import clsx from 'clsx';

type DashboardSpinnerProps = {
  className?: string;
};

/** Компактный spinner для загрузки содержимого модалок и небольших интерактивных областей. */
export function DashboardSpinner({ className }: DashboardSpinnerProps) {
  return <span className={clsx('dashboard-spinner', className)} aria-hidden="true" />;
}

type DashboardLoadingStateProps = {
  className?: string;
};

/** Центрированный spinner с резервированием области; без видимого текста. */
export function DashboardLoadingState({ className }: DashboardLoadingStateProps) {
  return (
    <div className={clsx('dashboard-loading-state', className)} aria-busy="true" aria-live="polite">
      <DashboardSpinner />
    </div>
  );
}
