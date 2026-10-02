import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import {
  getEditArticleVkPlusMenuStyle,
  type EditArticleVkPlusMenuStyleResult,
} from './editArticleVkPlusMenu';
import { resolveDashboardAccessMenuPortalFromElement } from './useDashboardAccessMenu';

export function useEditArticleVkPlusMenu(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>
) {
  const [menuLayout, setMenuLayout] = useState<EditArticleVkPlusMenuStyleResult>(() =>
    getEditArticleVkPlusMenuStyle(null, null)
  );

  const updateMenuLayout = useCallback(() => {
    const menuEl = menuRef.current;
    const menuSize = menuEl ? { width: menuEl.offsetWidth, height: menuEl.offsetHeight } : null;
    setMenuLayout(getEditArticleVkPlusMenuStyle(triggerRef.current, menuSize));
  }, [menuRef, triggerRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuLayout();
  }, [isOpen, updateMenuLayout]);

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateMenuLayout);
    window.addEventListener('scroll', updateMenuLayout, true);

    return () => {
      window.removeEventListener('resize', updateMenuLayout);
      window.removeEventListener('scroll', updateMenuLayout, true);
    };
  }, [isOpen, updateMenuLayout]);

  const portalRoot =
    isOpen && typeof document !== 'undefined'
      ? resolveDashboardAccessMenuPortalFromElement(triggerRef.current)
      : null;

  return { menuLayout, portalRoot, updateMenuLayout };
}
