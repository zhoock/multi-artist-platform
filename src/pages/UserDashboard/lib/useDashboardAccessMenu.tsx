import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

export const DASHBOARD_ACCESS_MENU_WIDTH = 268;
export const DASHBOARD_ACCESS_MENU_FALLBACK_POSITION = { top: 120, left: 24 } as const;
export const DASHBOARD_ACCESS_MENU_Z_INDEX = 10050;

export type DashboardAccessMenuPosition = {
  top: number;
  left: number;
};

export type UseDashboardAccessMenuOptions = {
  /** Controlled open state (Album/Article). Omit for internal state (Stem, track row). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Re-run layout positioning when row identity changes. */
  repositionKey?: unknown;
  getPortalRoot: (trigger: HTMLElement | null) => HTMLElement | null;
  menuWidth?: number;
};

/** Portal target: dialog top layer, optionally `.user-dashboard` inside dialog (Mixer stems). */
export function resolveDashboardAccessMenuPortalFromElement(
  element: HTMLElement | null,
  options?: { preferUserDashboard?: boolean }
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (!element) return document.body;

  const dialog =
    (element.closest('dialog.popup') as HTMLElement | null) ??
    (element.closest('dialog') as HTMLElement | null);

  if (dialog) {
    if (options?.preferUserDashboard) {
      return (dialog.querySelector('.user-dashboard') as HTMLElement | null) ?? dialog;
    }
    return dialog;
  }

  return document.body;
}

export function computeDashboardAccessMenuPosition(
  trigger: HTMLElement | null,
  menuWidth = DASHBOARD_ACCESS_MENU_WIDTH
): DashboardAccessMenuPosition {
  if (trigger == null) {
    return { ...DASHBOARD_ACCESS_MENU_FALLBACK_POSITION };
  }

  const rect = trigger.getBoundingClientRect();
  return {
    top: rect.bottom + 4,
    left: Math.min(rect.left, window.innerWidth - menuWidth - 8),
  };
}

export function getDashboardAccessMenuStyle(
  position: DashboardAccessMenuPosition | null
): CSSProperties {
  const { top, left } = position ?? DASHBOARD_ACCESS_MENU_FALLBACK_POSITION;

  return {
    position: 'fixed',
    top,
    left,
    zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
    minWidth: 240,
    maxWidth: 280,
  };
}

export function useDashboardAccessMenu({
  open: controlledOpen,
  onOpenChange,
  repositionKey,
  getPortalRoot,
  menuWidth = DASHBOARD_ACCESS_MENU_WIDTH,
}: UseDashboardAccessMenuOptions) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const menuOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<DashboardAccessMenuPosition | null>(null);

  const setMenuOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onOpenChange?.(next);
        return;
      }
      setUncontrolledOpen(next);
    },
    [isControlled, onOpenChange]
  );

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, [setMenuOpen]);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !menuOpen) return;
    setMenuPos(computeDashboardAccessMenuPosition(el, menuWidth));
  }, [menuOpen, menuWidth]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
    }
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
  }, [menuOpen, updateMenuPosition, repositionKey]);

  useEffect(() => {
    if (!menuOpen) return;
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;

    let detached: (() => void) | null = null;
    let cancelled = false;

    const scheduleId = window.setTimeout(() => {
      if (cancelled) return;

      const onDown = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (triggerRef.current?.contains(target)) return;
        if (menuRef.current?.contains(target)) return;
        closeMenu();
      };

      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
      detached = () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('touchstart', onDown);
      };
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(scheduleId);
      detached?.();
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  const toggleMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (menuOpen) {
        closeMenu();
        return;
      }

      setMenuPos(computeDashboardAccessMenuPosition(triggerRef.current, menuWidth));
      setMenuOpen(true);
    },
    [menuOpen, closeMenu, setMenuOpen, menuWidth]
  );

  const portalMount = typeof document !== 'undefined' ? getPortalRoot(triggerRef.current) : null;
  const menuStyle = getDashboardAccessMenuStyle(menuPos);

  return {
    triggerRef,
    menuRef,
    menuOpen,
    menuPos,
    menuStyle,
    portalMount,
    toggleMenu,
    closeMenu,
  };
}

type DashboardAccessMenuPortalProps = {
  menuRef: Ref<HTMLDivElement>;
  open: boolean;
  portalMount: HTMLElement | null;
  menuStyle: CSSProperties;
  children: ReactNode;
};

export function DashboardAccessMenuPortal({
  menuRef,
  open,
  portalMount,
  menuStyle,
  children,
}: DashboardAccessMenuPortalProps) {
  if (!open || typeof document === 'undefined' || portalMount == null) {
    return null;
  }

  return createPortal(
    <div ref={menuRef} className="user-dashboard__track-access-menu" style={menuStyle} role="menu">
      {children}
    </div>,
    portalMount
  );
}
