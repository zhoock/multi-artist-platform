import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { BillingSnapshot } from '@shared/api/billing';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Lock as LockIcon, Trash2 as Trash2Icon } from 'lucide-react';

import type { MyArchiveArtist } from '@shared/api/archive';
import {
  canRemoveCollectionArtist,
  formatCollectionArtistReplaceInLabel,
  isCollectionArtistActive,
  isCollectionArtistTimeLocked,
} from '@shared/lib/archive/collectionLock';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { DashboardButton } from '@shared/ui/dashboard';
import {
  DASHBOARD_ACCESS_MENU_Z_INDEX,
  resolveDashboardAccessMenuPortalFromElement,
} from '../../lib/useDashboardAccessMenu';
import { resolveCollectionArtistRemoveButtonMode } from '@shared/lib/archive/collectionArtistRemoveMode';
import { traceCollectionRemove } from '@shared/lib/archive/collectionArtistRemoveTrace';
import {
  registerRenewalCountdownTarget,
  syncRenewalCountdownClockNow,
  unregisterRenewalCountdownTarget,
} from '@shared/lib/subscription/renewalCountdownClock';
import { useRenewalCountdownClock } from '@shared/lib/subscription/useRenewalCountdown';

const TOOLTIP_GAP_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 256;

type Props = {
  artist: MyArchiveArtist;
  hasPremiumAccess: boolean;
  lang: 'en' | 'ru';
  removeLabel: string;
  removeSubscriptionTooltip: string;
  removeLockedPeriodHint: string;
  actionBusy: boolean;
  onRemove: (artist: MyArchiveArtist) => void;
  /** Called once when the time lock (`lockedUntil`) expires locally — sync archive with server. */
  onTimeLockExpired?: () => void;
  /** Post-period auto-renew hold — keep lock UI (covers stale `hasPremiumAccess`). */
  autorenewCollectionHold?: boolean;
  billing?: Pick<
    BillingSnapshot,
    'autoRenewEnabled' | 'hasSavedPaymentMethod' | 'nextChargeAt' | 'expiresAt' | 'status'
  >;
  /** Primary tooltip while auto-renew hold (e.g. «обновляется…»). */
  autoRenewPendingLabel?: string;
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

/** Same wall clock as billing renewal countdown — avoids lock/billing timer skew. */
function useArtistLockClock(lockedUntil: string | null | undefined, trackExpiry: boolean) {
  const now = useRenewalCountdownClock();

  useEffect(() => {
    if (!trackExpiry || !lockedUntil?.trim()) return undefined;
    const id = registerRenewalCountdownTarget(lockedUntil);
    return () => unregisterRenewalCountdownTarget(id);
  }, [lockedUntil, trackExpiry]);

  useEffect(() => {
    if (!trackExpiry) return undefined;

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      syncRenewalCountdownClockNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [trackExpiry]);

  return now;
}

function useCollectionActionTooltip() {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPinned, setTooltipPinned] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
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

  const togglePinnedTooltip = useCallback(
    (event: React.MouseEvent) => {
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

  useEffect(() => () => clearHideTimeout(), [clearHideTimeout]);

  const renderTooltipPortal = (content: ReactNode) => {
    if (!tooltipOpen || !portalRoot || !content) return null;
    return createPortal(
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
    renderTooltipPortal,
  };
}

export function CollectionArtistRemoveAction({
  artist,
  hasPremiumAccess,
  lang,
  removeLabel,
  removeSubscriptionTooltip,
  removeLockedPeriodHint,
  actionBusy,
  onRemove,
  onTimeLockExpired,
  autorenewCollectionHold = false,
  billing,
  autoRenewPendingLabel,
}: Props) {
  const tooltip = useCollectionActionTooltip();
  const isActive = isCollectionArtistActive(artist);

  const shouldSyncLockClock = isActive && Boolean(artist.lockedUntil?.trim());
  const lockNow = useArtistLockClock(artist.lockedUntil, shouldSyncLockClock);

  const timeLocked = isActive && isCollectionArtistTimeLocked(artist, lockNow);
  const showRenewalHold = isActive && !timeLocked && autorenewCollectionHold;
  const showLockUi = timeLocked || showRenewalHold;
  const showSubscriptionGate =
    isActive && !timeLocked && !hasPremiumAccess && !autorenewCollectionHold;
  const removable =
    canRemoveCollectionArtist(artist, hasPremiumAccess, lockNow) && !autorenewCollectionHold;

  const mode = resolveCollectionArtistRemoveButtonMode({
    artist,
    hasPremiumAccess,
    billing: billing ?? {
      autoRenewEnabled: false,
      hasSavedPaymentMethod: false,
      nextChargeAt: null,
      expiresAt: null,
    },
    now: lockNow,
  });

  const lastModeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;
    traceCollectionRemove({
      source: 'CollectionArtistRemoveAction.render',
      artistUserId: artist.artistUserId,
      billingStatus: billing?.status,
      hasPremiumAccess,
      autoRenewEnabled: billing?.autoRenewEnabled,
      hasSavedPaymentMethod: billing?.hasSavedPaymentMethod,
      nextChargeAt: billing?.nextChargeAt,
      expiresAt: billing?.expiresAt,
      autorenewCollectionHold,
      lockedUntil: artist.lockedUntil,
      timeLocked,
      showSubscriptionGate,
      mode,
    });
  }, [
    artist.artistUserId,
    artist.lockedUntil,
    autorenewCollectionHold,
    billing?.autoRenewEnabled,
    billing?.expiresAt,
    billing?.hasSavedPaymentMethod,
    billing?.nextChargeAt,
    billing?.status,
    hasPremiumAccess,
    mode,
    showSubscriptionGate,
    timeLocked,
  ]);

  const wasTimeLockedRef = useRef(timeLocked);
  useEffect(() => {
    if (wasTimeLockedRef.current && !timeLocked && isActive) {
      traceCollectionRemove({
        source: 'CollectionArtistRemoveAction.onTimeLockExpired',
        artistUserId: artist.artistUserId,
      });
      onTimeLockExpired?.();
    }
    wasTimeLockedRef.current = timeLocked;
  }, [artist.artistUserId, isActive, onTimeLockExpired, timeLocked]);

  if (showLockUi) {
    const replaceInLabel = timeLocked
      ? formatCollectionArtistReplaceInLabel(artist.lockedUntil, lang, lockNow)
      : null;
    const renewalPrimary =
      showRenewalHold && autoRenewPendingLabel?.trim() ? autoRenewPendingLabel : null;
    const primaryLabel = replaceInLabel ?? renewalPrimary;
    const showSubscriptionHint =
      !hasPremiumAccess && !autorenewCollectionHold && Boolean(replaceInLabel);

    const tooltipContent = (
      <>
        {primaryLabel ? <p className="collection__lock-tooltip-primary">{primaryLabel}</p> : null}
        {replaceInLabel ? (
          <p className="collection__lock-tooltip-secondary">{removeLockedPeriodHint}</p>
        ) : null}
        {showSubscriptionHint ? (
          <p className="collection__lock-tooltip-secondary">{removeSubscriptionTooltip}</p>
        ) : null}
      </>
    );

    return (
      <span
        ref={tooltip.triggerRef}
        className={clsx(
          'collection__lock-action',
          tooltip.tooltipOpen && 'collection__lock-action--open'
        )}
        onMouseEnter={tooltip.showTooltip}
        onMouseLeave={tooltip.scheduleHideTooltip}
      >
        <DashboardButton
          variant="icon"
          className="collection__lock-action-btn"
          aria-label={removeLabel}
          aria-describedby={tooltip.tooltipId}
          onFocus={tooltip.showTooltip}
          onBlur={tooltip.scheduleHideTooltip}
          onClick={tooltip.togglePinnedTooltip}
        >
          <LockIcon {...dashboardActionIconProps()} />
        </DashboardButton>
        {tooltip.renderTooltipPortal(tooltipContent)}
      </span>
    );
  }

  if (showSubscriptionGate) {
    const gateAria = `${removeLabel}. ${removeSubscriptionTooltip}`;

    return (
      <span
        ref={tooltip.triggerRef}
        className={clsx(
          'collection__subscription-gate-action',
          tooltip.tooltipOpen && 'collection__subscription-gate-action--open'
        )}
        onMouseEnter={tooltip.showTooltip}
        onMouseLeave={tooltip.scheduleHideTooltip}
      >
        <DashboardButton
          variant="icon"
          className="collection__subscription-gate-btn"
          aria-label={gateAria}
          aria-describedby={tooltip.tooltipId}
          onFocus={tooltip.showTooltip}
          onBlur={tooltip.scheduleHideTooltip}
          onClick={tooltip.togglePinnedTooltip}
        >
          <Trash2Icon {...dashboardActionIconProps()} />
        </DashboardButton>
        {tooltip.renderTooltipPortal(
          <p className="collection__lock-tooltip-primary">{removeSubscriptionTooltip}</p>
        )}
      </span>
    );
  }

  const removeDisabled = actionBusy || !removable;

  return (
    <DashboardButton
      variant="icon"
      destructive
      className="collection__remove-action"
      disabled={removeDisabled}
      aria-label={removeLabel}
      onClick={(event) => {
        event.stopPropagation();
        void onRemove(artist);
      }}
    >
      <Trash2Icon {...dashboardActionIconProps()} />
    </DashboardButton>
  );
}
