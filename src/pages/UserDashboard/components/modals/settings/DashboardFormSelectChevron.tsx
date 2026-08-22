import clsx from 'clsx';

type DashboardFormSelectChevronProps = {
  open?: boolean;
};

export function DashboardFormSelectChevron({ open = false }: DashboardFormSelectChevronProps) {
  return (
    <svg
      className={clsx('dashboard-form-select__arrow', open && 'dashboard-form-select__arrow--open')}
      width="12"
      height="8"
      viewBox="0 0 12 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M1 1L6 6L11 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
