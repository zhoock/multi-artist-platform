import clsx from 'clsx';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';

import { useDashboardFormSelectDropdown } from '../../../lib/useDashboardFormSelectDropdown';

type DashboardFormSelectDropdownProps = {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  dropdownRef?: RefObject<HTMLDivElement>;
  className?: string;
  dataAttribute?: string;
};

export function DashboardFormSelectDropdown({
  isOpen,
  triggerRef,
  children,
  dropdownRef,
  className,
  dataAttribute,
}: DashboardFormSelectDropdownProps) {
  const { dropdownStyle, portalRoot } = useDashboardFormSelectDropdown(isOpen, triggerRef);

  if (!isOpen || !portalRoot) {
    return null;
  }

  return createPortal(
    <div
      ref={dropdownRef}
      className={clsx(
        'dashboard-form-select__dropdown',
        'dashboard-form-select__dropdown--fixed',
        className
      )}
      style={dropdownStyle}
      role="listbox"
      {...(dataAttribute ? { 'data-dashboard-form-select-dropdown': dataAttribute } : {})}
    >
      {children}
    </div>,
    portalRoot
  );
}
