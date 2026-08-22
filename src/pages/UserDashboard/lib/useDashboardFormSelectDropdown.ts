import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

import { getDashboardFormSelectDropdownStyle } from './dashboardFormSelectDropdown';
import { resolveDashboardAccessMenuPortalFromElement } from './useDashboardAccessMenu';

export function useDashboardFormSelectDropdown(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>
) {
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>(() =>
    getDashboardFormSelectDropdownStyle(null)
  );

  const updateDropdownPosition = useCallback(() => {
    setDropdownStyle(getDashboardFormSelectDropdownStyle(triggerRef.current));
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen, updateDropdownPosition]);

  const portalRoot =
    isOpen && typeof document !== 'undefined'
      ? resolveDashboardAccessMenuPortalFromElement(triggerRef.current)
      : null;

  return { dropdownStyle, portalRoot, updateDropdownPosition };
}
