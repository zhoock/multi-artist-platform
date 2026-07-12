import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Lock as LockIcon, Trash2 as Trash2Icon } from 'lucide-react';

import type { MyArchiveArtist } from '@shared/api/archive';
import {
  canRemoveCollectionArtist,
  formatCollectionArtistReplaceInDaysLabel,
  getCollectionArtistLockDaysRemaining,
  isCollectionArtistLocked,
} from '@shared/lib/archive/collectionLock';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { DashboardButton } from '@shared/ui/dashboard';
import {
  DASHBOARD_ACCESS_MENU_Z_INDEX,
  resolveDashboardAccessMenuPortalFromElement,
} from '../../lib/useDashboardAccessMenu';

const TOOLTIP_GAP_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 256;

type Props = {
  artist: MyArchiveArtist;
  isPremium: boolean;
  lang: 'en' | 'ru';
  removeLabel: string;
  removeSubscriptionTooltip: string;
  removeLockedPeriodHint: string;
  actionBusy: boolean;
  onRemove: (artist: MyArchiveArtist) => void;
};

function computeLockTooltipStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const maxWidth = Math.min(TOOLTIP_MAX_WIDTH_PX, window.innerWidth - 16);
  const left = Math.min(Math.max(8, rect.right - maxWidth), window.innerWidth - maxWidth - 8);

  return {
    position: 'fixed',
    top: rect.top - TOOLTIP_GAP_PX,
    left,
    width: maxWidth,
    transform: 'translateY(-100%)',
    zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
  };
}

export function CollectionArtistRemoveAction({
  artist,
  isPremium,
  lang,
  removeLabel,
  removeSubscriptionTooltip,
  removeLockedPeriodHint,
  actionBusy,
  onRemove,
}: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPinned, setTooltipPinned] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const tooltipId = useId();

  const artistIsLocked = isCollectionArtistLocked(artist);
  const removable = canRemoveCollectionArtist(artist, isPremium);
  const removeDisabled = actionBusy || !removable;

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setTooltipStyle(computeLockTooltipStyle(trigger));
  }, []);

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

  useEffect(() => () => clearHideTimeout(), [clearHideTimeout]);

  if (artistIsLocked) {
    const daysRemaining = getCollectionArtistLockDaysRemaining(artist.lockedUntil);
    const replaceInDaysLabel = formatCollectionArtistReplaceInDaysLabel(daysRemaining, lang);

    const tooltip =
      tooltipOpen && portalRoot
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              aria-hidden={false}
              className="collection__lock-tooltip collection__lock-tooltip--portal"
              style={tooltipStyle}
              onMouseEnter={showTooltip}
              onMouseLeave={scheduleHideTooltip}
            >
              <p className="collection__lock-tooltip-primary">{replaceInDaysLabel}</p>
              <p className="collection__lock-tooltip-secondary">{removeLockedPeriodHint}</p>
            </div>,
            portalRoot
          )
        : null;

    return (
      <span
        ref={triggerRef}
        className={clsx('collection__lock-action', tooltipOpen && 'collection__lock-action--open')}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleHideTooltip}
      >
        <DashboardButton
          variant="icon"
          className="collection__lock-action-btn"
          aria-label={removeLabel}
          aria-describedby={tooltipId}
          onFocus={showTooltip}
          onBlur={scheduleHideTooltip}
          onClick={(event) => {
            event.stopPropagation();
            if (tooltipPinned && tooltipOpen) {
              closeTooltip();
              return;
            }
            setTooltipPinned(true);
            showTooltip();
          }}
        >
          <LockIcon {...dashboardActionIconProps()} />
        </DashboardButton>
        {tooltip}
      </span>
    );
  }

  const removeTooltip =
    !removable && artist.isActive && !isPremium ? removeSubscriptionTooltip : undefined;

  return (
    <DashboardButton
      variant="icon"
      destructive
      className="collection__remove-action"
      disabled={removeDisabled}
      aria-label={removeTooltip ? `${removeLabel}. ${removeTooltip}` : removeLabel}
      onClick={(event) => {
        event.stopPropagation();
        void onRemove(artist);
      }}
    >
      <Trash2Icon {...dashboardActionIconProps()} />
    </DashboardButton>
  );
}
