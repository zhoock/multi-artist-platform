import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import {
  DASHBOARD_ACCESS_MENU_Z_INDEX,
  resolveDashboardAccessMenuPortalFromElement,
} from './useDashboardAccessMenu';

const TOOLTIP_GAP_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 280;

export function computeDashboardHintTooltipStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const maxWidth = Math.min(TOOLTIP_MAX_WIDTH_PX, window.innerWidth - 16);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - maxWidth - 8);

  return {
    position: 'fixed',
    top: rect.top - TOOLTIP_GAP_PX,
    left,
    width: maxWidth,
    transform: 'translateY(-100%)',
    zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
  };
}

type UseDashboardHoverTooltipOptions = {
  computeStyle?: (trigger: HTMLElement) => CSSProperties;
  tooltipClassName?: string;
};

export function useDashboardHoverTooltip(options: UseDashboardHoverTooltipOptions = {}) {
  const { computeStyle = computeDashboardHintTooltipStyle, tooltipClassName = '' } = options;

  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPinned, setTooltipPinned] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const tooltipId = useId();

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setTooltipStyle(computeStyle(trigger));
  }, [computeStyle]);

  const showTooltip = useCallback(() => {
    clearHideTimeout();
    const trigger = triggerRef.current;
    setPortalRoot(resolveDashboardAccessMenuPortalFromElement(trigger));
    updateTooltipPosition();
    setTooltipOpen(true);
  }, [clearHideTimeout, updateTooltipPosition]);

  const hideTooltip = useCallback(() => {
    if (tooltipPinned) return;
    setTooltipOpen(false);
  }, [tooltipPinned]);

  const scheduleHideTooltip = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(hideTooltip, 80);
  }, [clearHideTimeout, hideTooltip]);

  const closeTooltip = useCallback(() => {
    clearHideTimeout();
    setTooltipPinned(false);
    setTooltipOpen(false);
  }, [clearHideTimeout]);

  const togglePinnedTooltip = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (tooltipPinned && tooltipOpen) {
        closeTooltip();
        return;
      }
      setTooltipPinned(true);
      showTooltip();
    },
    [closeTooltip, showTooltip, tooltipOpen, tooltipPinned]
  );

  useLayoutEffect(() => {
    if (!tooltipOpen) return;

    updateTooltipPosition();

    const handleLayoutChange = () => updateTooltipPosition();
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);

    return () => {
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [tooltipOpen, updateTooltipPosition]);

  useEffect(() => {
    if (!tooltipOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }
      closeTooltip();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [closeTooltip, tooltipOpen]);

  useEffect(() => {
    if (!tooltipOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeTooltip();
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeTooltip, tooltipOpen]);

  useEffect(() => () => clearHideTimeout(), [clearHideTimeout]);

  const renderTooltipPortal = (content: ReactNode) => {
    if (!tooltipOpen || !portalRoot || !content) return null;
    return createPortal(
      <div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        className={tooltipClassName}
        style={tooltipStyle}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleHideTooltip}
      >
        {content}
      </div>,
      portalRoot
    );
  };

  return {
    triggerRef,
    tooltipId,
    tooltipOpen,
    showTooltip,
    scheduleHideTooltip,
    togglePinnedTooltip,
    closeTooltip,
    renderTooltipPortal,
  };
}
