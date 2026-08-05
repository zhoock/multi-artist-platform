import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import {
  ArchiveApiError,
  activateArchiveArtistsApi,
  getMyArchive,
  removeArtistFromArchiveApi,
  type MyArchiveArtist,
  type MyArchiveData,
} from '@shared/api/archive';
import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';
import { resolveCollectionBillingOverlays } from '@features/premiumSubscription/lib/resolveCollectionBillingOverlays';
import {
  canRemoveCollectionArtist,
  normalizeCollectionArchive,
} from '@shared/lib/archive/collectionLock';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { CheckSquare, Plus as PlusIcon, Square } from 'lucide-react';
import {
  dispatchArchiveArtistRemoved,
  refreshPremiumContentForArchiveChange,
  ARCHIVE_CHANGED_EVENT,
} from '@features/artistArchive';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import type { SubscriptionPlanSlug } from '@shared/lib/payment/subscriptionPlans';
import { resolveRecommendedPlanSlug } from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';
import { useSubscriptionBilling } from '@shared/lib/subscription/useSubscriptionBilling';
import { useSubscriptionRebindPayment } from '@shared/lib/subscription/useSubscriptionRebindPayment';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';
import { resolveAutoRenewClientError } from '@shared/lib/subscription/resolveAutoRenewClientError';

import { CollectionArtistRemoveAction } from './CollectionArtistRemoveAction';
import {
  DisableAutoRenewConfirmModal,
  EnableAutoRenewConfirmModal,
  RebindPaymentMethodModal,
  UpgradePlanConfirmModal,
  type BillingAutoRenewModalVariant,
} from './billingModals';
import { CollectionBillingSummary, type CollectionBillingCopy } from './CollectionBillingSummary';
import { CollectionEmptyState } from './CollectionEmptyState';
import { formatCollectionRenewalDate } from './lib/collectionSubscriptionStatus';
import { toast } from '@shared/lib/toast';
import { ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS } from '@shared/lib/toast/toastDurations';
import './billingModals/billingModals.scss';
import './CollectionBillingSummary.scss';
import './MyArchiveContent.scss';

type RemovalToastKind = 'single' | 'bulk' | 'cleared';

function canRemoveArtist(artist: MyArchiveArtist, hasPremiumAccess: boolean): boolean {
  return canRemoveCollectionArtist(artist, hasPremiumAccess);
}

type Props = {
  active: boolean;
  onContentReady?: () => void;
  onContentBusy?: () => void;
  onMountPinChange?: (pinned: boolean) => void;
};

export function MyArchiveContent({
  active,
  onContentReady,
  onContentBusy,
  onMountPinChange,
}: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openSupportModal, startCheckout } = useArchiveAccessModal();

  const [data, setData] = useState<MyArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [autoRenewModal, setAutoRenewModal] = useState<BillingAutoRenewModalVariant | null>(null);
  const [upgradePlanTarget, setUpgradePlanTarget] = useState<SubscriptionPlanSlug | null>(null);
  const {
    patchAutoRenew,
    cancelScheduledDowngrade,
    loading: autoRenewPatchLoading,
  } = useSubscriptionBilling();
  const { startRebind } = useSubscriptionRebindPayment();
  const skipNextArchiveReloadRef = useRef(false);
  const loadErrorTextRef = useRef<string | null>(null);
  const onContentReadyRef = useRef(onContentReady);
  const onContentBusyRef = useRef(onContentBusy);

  const t = ui?.dashboard?.collection;
  const autoRenewActionsEnabled = isSubscriptionAutoRenewClientEnabled();
  const autoRenewPatchErrorText =
    t?.billingAutoRenewPatchError ?? 'Не удалось обновить автопродление';
  loadErrorTextRef.current = t?.loadError ?? null;
  onContentReadyRef.current = onContentReady;
  onContentBusyRef.current = onContentBusy;

  const showRemovalToast = useCallback(
    (kind: RemovalToastKind, count = 1) => {
      let message: string;
      if (kind === 'cleared') {
        message = t?.collectionClearedToast ?? 'Collection cleared';
      } else if (kind === 'single') {
        message = t?.artistRemovedToast ?? 'Artist removed from collection';
      } else {
        message = (t?.artistsRemovedToast ?? '{count} artists removed from collection').replace(
          '{count}',
          String(count)
        );
      }
      toast.show({
        variant: 'success',
        title: message,
        duration: ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS,
      });
    },
    [t?.artistRemovedToast, t?.artistsRemovedToast, t?.collectionClearedToast]
  );

  const loadArchive = useCallback(async () => {
    setLoading(true);
    onContentBusyRef.current?.();
    setError(null);
    try {
      const next = normalizeCollectionArchive(await getMyArchive());
      setData(next);
    } catch (err) {
      console.error('[MyArchiveContent] load failed', err);
      setError(
        err instanceof Error
          ? err.message
          : (loadErrorTextRef.current ?? 'Failed to load collection')
      );
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [lang]);

  useEffect(() => {
    if (!active) return;
    void loadArchive();
  }, [active, loadArchive]);

  useEffect(() => {
    if (!onMountPinChange) return;
    onMountPinChange(bulkLoading || Boolean(removingId) || Boolean(activatingId));
  }, [bulkLoading, removingId, activatingId, onMountPinChange]);

  useLayoutEffect(() => {
    if (hasLoadedOnce && !loading) {
      onContentReadyRef.current?.();
    }
  }, [hasLoadedOnce, loading]);

  useEffect(() => {
    if (!active) return;
    const onChanged = () => {
      if (skipNextArchiveReloadRef.current) {
        skipNextArchiveReloadRef.current = false;
        return;
      }
      void loadArchive();
    };
    window.addEventListener('archive:changed', onChanged);
    return () => window.removeEventListener('archive:changed', onChanged);
  }, [active, loadArchive]);

  const slotsUsed = data?.slotsUsed ?? 0;
  const slotsLimit = data?.slotsLimit ?? 3;
  const inactiveCount = data?.inactiveCount ?? data?.artists.filter((a) => !a.isActive).length ?? 0;
  const billing = data?.billing ?? EMPTY_BILLING_SNAPSHOT;
  const hasPremiumAccess = billing.hasPremiumAccess;
  const billingScreen = useMemo(() => resolveCollectionBillingScreen(billing), [billing]);
  const billingOverlays = useMemo(
    () =>
      resolveCollectionBillingOverlays({
        billing,
        billingScreen,
        slotsUsed,
      }),
    [billing, billingScreen, slotsUsed]
  );
  const planSlug: SubscriptionPlanSlug | null = billing.plan;
  const slotsRemaining = Math.max(0, slotsLimit - slotsUsed);

  const billingCopy = useMemo((): CollectionBillingCopy => {
    const priceCurrency = ui?.dashboard?.forms?.priceCurrency ?? t?.billingPriceCurrency ?? '₽';
    return {
      billingCurrentPlanSection: t?.billingCurrentPlanSection ?? 'ТЕКУЩИЙ ПЛАН',
      billingLastPlanSection: t?.billingLastPlanSection ?? 'ПОСЛЕДНИЙ ПЛАН',
      billingSupportSection: t?.billingSupportSection ?? 'ПОДДЕРЖКА',
      billingSupportActiveUntil: t?.billingSupportActiveUntil ?? 'Поддержка активна до {date}',
      billingSupportExpiredOn: t?.billingSupportExpiredOn ?? 'Истёк {date}',
      billingChangePlanButton: t?.billingChangePlanButton ?? t?.changePlanButton ?? 'Сменить план',
      billingRecommendedPlanSection: t?.billingRecommendedPlanSection ?? 'РЕКОМЕНДУЕМЫЙ ПЛАН',
      billingUpgradePlanButton: t?.billingUpgradePlanButton ?? 'Повысить тариф',
      billingCollectionUsageSection: t?.billingCollectionUsageSection ?? 'Использование коллекции',
      billingCollectionUsageCount: t?.billingCollectionUsageCount ?? '{used} из {limit}',
      billingCancelledBannerTitle: t?.billingCancelledBannerTitle ?? 'Поддержка отменена',
      billingCancelledBannerBody:
        t?.billingCancelledBannerBody ??
        'Автопродление отключено. Поддержка артистов сохранится до окончания оплаченного периода.',
      billingCancelledBannerCta: t?.billingCancelledBannerCta ?? 'Возобновить поддержку',
      billingExpiredBannerTitle: t?.billingExpiredBannerTitle ?? 'Поддержка завершена',
      billingExpiredBannerBody:
        t?.billingExpiredBannerBody ??
        'Срок оплаченного периода закончился. Чтобы снова поддерживать любимых артистов и пользоваться премиум-функциями, выберите тариф.',
      billingExpiredBannerCta: t?.billingExpiredBannerCta ?? 'Выбрать тариф',
      billingPaymentFailedBannerTitle:
        t?.billingPaymentFailedBannerTitle ?? 'Не удалось продлить поддержку',
      billingPaymentFailedBannerBody:
        t?.billingPaymentFailedBannerBody ??
        'Не удалось списать ежемесячный платёж. Обновите платёжные данные, чтобы возобновить поддержку.',
      billingPaymentFailedBannerCta:
        t?.billingPaymentFailedBannerCta ?? 'Обновить платёжные данные',
      billingPaymentFailedNextRetry:
        t?.billingPaymentFailedNextRetry ?? 'Следующая попытка: {date}',
      billingPaymentFailedGraceEnds:
        t?.billingPaymentFailedGraceEnds ?? 'Доступ сохранится до: {date}',
      billingPreBillingBannerTitle: t?.billingPreBillingBannerTitle ?? 'Скоро списание',
      billingPreBillingBannerBody:
        t?.billingPreBillingBannerBody ??
        'Поддержка {plan} ({amount} {currency}) продлится {date}.',
      billingDowngradeSlotsBannerTitle:
        t?.billingDowngradeSlotsBannerTitle ?? 'Запланировано понижение тарифа',
      billingDowngradeSlotsBannerBody:
        t?.billingDowngradeSlotsBannerBody ??
        'С {date} тариф изменится на {plan} ({limit} артистов). Сейчас в коллекции {used} артистов — удалите лишних или отмените понижение.',
      billingDowngradeSlotsBannerCta:
        t?.billingDowngradeSlotsBannerCta ?? 'Отменить плановое понижение',
      billingDisableAutoRenewLink: t?.billingDisableAutoRenewLink ?? 'Отключить автопродление',
      priceCurrency,
      activeSlotsLabel: t?.activeSlotsLabel ?? 'артистов в коллекции',
    };
  }, [t, ui?.dashboard?.forms?.priceCurrency]);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    if (inactiveCount === 0 && isSelectMode) {
      exitSelectMode();
    }
  }, [inactiveCount, isSelectMode, exitSelectMode]);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const toggleSelected = useCallback(
    (artistUserId: string) => {
      const artist = data?.artists.find((entry) => entry.artistUserId === artistUserId);
      if (!artist || artist.isActive) return;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(artistUserId)) {
          next.delete(artistUserId);
        } else {
          next.add(artistUserId);
        }
        return next;
      });
    },
    [data?.artists]
  );

  const removeArtistsList = useCallback(
    async (toRemove: MyArchiveArtist[], removalToast?: 'bulk' | 'cleared') => {
      if (!data || bulkLoading || toRemove.length === 0) return;

      setBulkLoading(true);
      setError(null);

      try {
        let latest = data;
        for (const artist of toRemove) {
          const { archive } = await removeArtistFromArchiveApi(artist.artistUserId);
          latest = archive;
          skipNextArchiveReloadRef.current = true;
          dispatchArchiveArtistRemoved(artist.artistUserId, artist.slug || undefined);
          refreshPremiumContentForArchiveChange(dispatch, artist.slug || undefined);
        }
        setData(latest ? normalizeCollectionArchive(latest) : latest);
        exitSelectMode();
        if (removalToast === 'cleared') {
          showRemovalToast('cleared');
        } else if (removalToast === 'bulk') {
          showRemovalToast(toRemove.length === 1 ? 'single' : 'bulk', toRemove.length);
        }
      } catch (err) {
        void loadArchive();
        setError(
          err instanceof Error ? err.message : (t?.removeError ?? 'Failed to remove artists')
        );
      } finally {
        setBulkLoading(false);
      }
    },
    [
      bulkLoading,
      data,
      dispatch,
      exitSelectMode,
      lang,
      loadArchive,
      showRemovalToast,
      t?.removeError,
    ]
  );

  const handleRemove = async (artist: MyArchiveArtist) => {
    if (removingId || bulkLoading || !canRemoveArtist(artist, hasPremiumAccess)) return;

    const previous = data;
    if (previous) {
      setData({
        ...previous,
        artists: previous.artists.filter((a) => a.artistUserId !== artist.artistUserId),
        slotsUsed: artist.isActive ? Math.max(0, previous.slotsUsed - 1) : previous.slotsUsed,
        inactiveCount: !artist.isActive
          ? Math.max(0, (previous.inactiveCount ?? 0) - 1)
          : previous.inactiveCount,
      });
    }

    setRemovingId(artist.artistUserId);
    setError(null);

    try {
      const { archive } = await removeArtistFromArchiveApi(artist.artistUserId);
      setData(normalizeCollectionArchive(archive));
      skipNextArchiveReloadRef.current = true;
      dispatchArchiveArtistRemoved(artist.artistUserId, artist.slug || undefined);
      refreshPremiumContentForArchiveChange(dispatch, artist.slug || undefined);
      setSelectedIds((prev) => {
        if (!prev.has(artist.artistUserId)) return prev;
        const next = new Set(prev);
        next.delete(artist.artistUserId);
        return next;
      });
      showRemovalToast('single');
    } catch (err) {
      setData(previous);
      const message =
        err instanceof ArchiveApiError
          ? err.code === 'ARCHIVE_ARTIST_LOCKED'
            ? (t?.artistLockedError ??
              'This artist is locked until the end of your billing period.')
            : err.code === 'ARCHIVE_SUBSCRIPTION_REQUIRED'
              ? (t?.removeRequiresSubscriptionError ??
                'Active support is required to remove artists.')
              : err.message
          : err instanceof Error
            ? err.message
            : (t?.removeError ?? 'Failed to remove artist');
      setError(message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleBulkRemove = async () => {
    if (!data || bulkLoading || selectedIds.size === 0) return;

    const toRemove = data.artists.filter(
      (artist) => selectedIds.has(artist.artistUserId) && canRemoveArtist(artist, hasPremiumAccess)
    );
    await removeArtistsList(toRemove, 'bulk');
  };

  const handleClearInactiveCollection = async () => {
    if (!data || bulkLoading || removingId) return;

    const toRemove = data.artists.filter(
      (artist) => !artist.isActive && canRemoveArtist(artist, hasPremiumAccess)
    );
    await removeArtistsList(toRemove, 'cleared');
  };

  const handleActivateSelected = async () => {
    if (!data || bulkLoading || selectedIds.size === 0 || !hasPremiumAccess) return;

    const inactiveSelected = data.artists.filter(
      (artist) => selectedIds.has(artist.artistUserId) && !artist.isActive
    );
    if (inactiveSelected.length === 0) return;

    const toActivate = inactiveSelected
      .slice(0, slotsRemaining)
      .map((artist) => artist.artistUserId);

    await activateArtists(toActivate, { exitSelectOnSuccess: true });
  };

  const activateArtists = useCallback(
    async (artistUserIds: string[], options?: { exitSelectOnSuccess?: boolean }) => {
      if (!data || bulkLoading || activatingId || artistUserIds.length === 0 || !hasPremiumAccess) {
        return;
      }

      const isBulkActivate = artistUserIds.length > 1 || options?.exitSelectOnSuccess;
      if (isBulkActivate) {
        setBulkLoading(true);
      } else {
        setActivatingId(artistUserIds[0] ?? null);
      }
      setError(null);

      try {
        const { archive } = await activateArchiveArtistsApi(artistUserIds);
        setData(normalizeCollectionArchive(archive));
        for (const artistUserId of artistUserIds) {
          const artist = data.artists.find((entry) => entry.artistUserId === artistUserId);
          refreshPremiumContentForArchiveChange(dispatch, artist?.slug || undefined);
        }
        skipNextArchiveReloadRef.current = true;
        window.dispatchEvent(new Event('archive:changed'));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const artistUserId of artistUserIds) {
            next.delete(artistUserId);
          }
          return next;
        });
        if (options?.exitSelectOnSuccess) {
          exitSelectMode();
        }
      } catch (err) {
        const message =
          err instanceof ArchiveApiError
            ? err.code === 'ARCHIVE_SLOTS_LIMIT' || err.code === 'ARCHIVE_ACTIVATION_LIMIT'
              ? (t?.activateLimitError ?? 'You can activate up to {count} artists.').replace(
                  '{count}',
                  String(slotsRemaining)
                )
              : err.message
            : err instanceof Error
              ? err.message
              : (t?.activateError ?? 'Failed to activate artists');
        setError(message);
      } finally {
        if (isBulkActivate) {
          setBulkLoading(false);
        } else {
          setActivatingId(null);
        }
      }
    },
    [
      activatingId,
      bulkLoading,
      data,
      dispatch,
      exitSelectMode,
      lang,
      slotsRemaining,
      t?.activateError,
      t?.activateLimitError,
    ]
  );

  const handleActivateArtist = async (artist: MyArchiveArtist) => {
    if (!artist.isActive) {
      await activateArtists([artist.artistUserId]);
    }
  };

  const handleBillingBannerAction = useCallback(async () => {
    if (renewLoading || bulkLoading || autoRenewPatchLoading) return;

    if (billingScreen === 'CANCELLED') {
      setAutoRenewModal('enable');
      return;
    }

    if (billingScreen === 'PAYMENT_FAILED') {
      setAutoRenewModal('enable-rebind');
      return;
    }

    if (billingScreen === 'EXPIRED' || !planSlug) {
      openSupportModal();
      return;
    }

    setRenewLoading(true);
    setError(null);

    const result = await startCheckout(planSlug);

    if (!result.ok) {
      setError(result.error);
      setRenewLoading(false);
      return;
    }

    if (result.redirected === 'auth') {
      setRenewLoading(false);
    }
  }, [
    autoRenewPatchLoading,
    billingScreen,
    bulkLoading,
    openSupportModal,
    planSlug,
    renewLoading,
    startCheckout,
  ]);

  const applyArchivePatchResult = useCallback((archive: MyArchiveData) => {
    setData(normalizeCollectionArchive(archive));
    window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT));
  }, []);

  const handleConfirmAutoRenewPatch = useCallback(async () => {
    if (!autoRenewModal || autoRenewModal === 'enable-rebind') return;

    setError(null);
    const enable = autoRenewModal === 'enable';
    const result = await patchAutoRenew(enable);

    if (!result.ok) {
      if (enable && result.code === 'PAYMENT_METHOD_REQUIRED') {
        setAutoRenewModal('enable-rebind');
        return;
      }
      setError(resolveAutoRenewClientError(result, autoRenewPatchErrorText));
      return;
    }

    applyArchivePatchResult(result.archive);
    setAutoRenewModal(null);
  }, [applyArchivePatchResult, autoRenewModal, autoRenewPatchErrorText, patchAutoRenew]);

  const handleConfirmAutoRenewRebind = useCallback(async () => {
    setRenewLoading(true);
    setError(null);

    const result = await startRebind();

    if (!result.ok) {
      setError(resolveAutoRenewClientError(result, autoRenewPatchErrorText));
      setRenewLoading(false);
    }
  }, [autoRenewPatchErrorText, startRebind]);

  const handleDisableAutoRenew = useCallback(() => {
    setAutoRenewModal('disable');
  }, []);

  const handleChangePlan = useCallback(() => {
    openSupportModal();
  }, [openSupportModal]);

  const handleUpgradePlan = useCallback(() => {
    const currentPlan = billing.plan;
    const recommended = resolveRecommendedPlanSlug(currentPlan);
    if (currentPlan && recommended) {
      setUpgradePlanTarget(recommended);
      return;
    }
    openSupportModal();
  }, [billing.plan, openSupportModal]);

  const handleConfirmUpgradePlan = useCallback(async () => {
    if (!upgradePlanTarget || renewLoading) return;

    setRenewLoading(true);
    setError(null);

    const result = await startCheckout(upgradePlanTarget, { intent: 'upgrade' });

    if (!result.ok) {
      setError(result.error);
      setRenewLoading(false);
      setUpgradePlanTarget(null);
      return;
    }

    if (result.redirected === 'auth') {
      setRenewLoading(false);
      setUpgradePlanTarget(null);
    }
  }, [renewLoading, startCheckout, upgradePlanTarget]);

  const handleCancelScheduledDowngrade = useCallback(async () => {
    if (autoRenewPatchLoading || renewLoading) return;

    setError(null);
    const result = await cancelScheduledDowngrade();

    if (!result.ok) {
      setError(result.error);
      return;
    }

    applyArchivePatchResult(result.archive);
  }, [applyArchivePatchResult, autoRenewPatchLoading, cancelScheduledDowngrade, renewLoading]);

  const removeLabel = t?.remove ?? 'Remove';
  const removeLockedPeriodHint =
    t?.removeLockedPeriodHint ??
    'Each artist is locked in your collection for 30 days after being added.';
  const removeSubscriptionTooltip =
    t?.removeSubscriptionTooltip ?? 'Active support is required to remove active artists.';
  const selectModeLabel = t?.selectMode ?? 'Select';
  const cancelSelectLabel = t?.cancelSelect ?? 'Done';
  const selectedCountLabel = t?.selectedCount ?? '{count} selected';
  const removeSelectedLabel = t?.removeSelected ?? 'Remove from collection';
  const activateSelectedTemplate = t?.activateSelected ?? 'Activate ({count})';
  const activateArtistLabel = t?.activateArtist ?? 'Activate';
  const activateLimitTemplate = t?.activateLimitError ?? 'You can activate up to {count} artists.';
  const selectHintTemplate = t?.selectActivateHint ?? 'You can select up to {count} artists';
  const inactiveArtistsLabel = t?.inactiveArtistsCount ?? '{count} inactive artists';
  const clearCollectionLabel = t?.clearCollection ?? 'Clear collection';

  const selectedCount = selectedIds.size;
  const selectedInactiveCount =
    data?.artists.filter((a) => selectedIds.has(a.artistUserId) && !a.isActive).length ?? 0;
  const activateCount = Math.min(selectedInactiveCount, slotsRemaining);
  const activateDisabled =
    bulkLoading || activateCount === 0 || selectedInactiveCount === 0 || !hasPremiumAccess;
  const removeSelectedDisabled =
    bulkLoading ||
    selectedCount === 0 ||
    !data?.artists.some(
      (a) => selectedIds.has(a.artistUserId) && canRemoveArtist(a, hasPremiumAccess)
    );

  const isCollectionEmpty = (data?.artists.length ?? 0) === 0;
  const showFullTabEmptyState = Boolean(
    data && !loading && !error && isCollectionEmpty && billingScreen === 'NONE'
  );
  const showInlineEmptyState = Boolean(
    data && !loading && !error && isCollectionEmpty && billingScreen !== 'NONE'
  );
  // Пока идёт загрузка или нет данных — не рисуем summary «0 / 3» (пустая оболочка).
  // Parent показывает DashboardLoadingState через onContentBusy / !archiveContentReady.
  const shouldBlockShell = !hasLoadedOnce || loading || (!data && !error);

  if (shouldBlockShell) {
    return null;
  }

  if (showFullTabEmptyState) {
    return (
      <section className="collection__tab collection__tab--empty">
        <CollectionEmptyState ui={ui} />
      </section>
    );
  }

  const billingExpiresLabel = billing.expiresAt
    ? formatCollectionRenewalDate(billing.expiresAt, lang)
    : null;
  const billingChargeLabel = billing.nextChargeAt
    ? formatCollectionRenewalDate(billing.nextChargeAt, lang)
    : billingExpiresLabel;
  const billingPriceCurrency =
    ui?.dashboard?.forms?.priceCurrency ?? t?.billingPriceCurrency ?? '₽';
  const autoRenewModalLoading = autoRenewPatchLoading || renewLoading;

  return (
    <>
      <DisableAutoRenewConfirmModal
        isOpen={autoRenewModal === 'disable'}
        expiresLabel={billingExpiresLabel}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewPatch()}
      />

      <EnableAutoRenewConfirmModal
        isOpen={autoRenewModal === 'enable'}
        planSlug={planSlug}
        chargeDateLabel={billingChargeLabel}
        paymentMethodTitle={billing.paymentMethodTitle}
        priceCurrency={billingPriceCurrency}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewPatch()}
        onChangePaymentMethod={() => setAutoRenewModal('enable-rebind')}
      />

      <RebindPaymentMethodModal
        isOpen={autoRenewModal === 'enable-rebind'}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewRebind()}
      />

      {upgradePlanTarget && billing.plan ? (
        <UpgradePlanConfirmModal
          isOpen
          currentPlanSlug={billing.plan}
          targetPlanSlug={upgradePlanTarget}
          priceCurrency={billingPriceCurrency}
          loading={renewLoading}
          onCancel={() => setUpgradePlanTarget(null)}
          onConfirm={() => void handleConfirmUpgradePlan()}
        />
      ) : null}
      <section
        className={clsx(
          'collection__tab',
          isSelectMode && 'collection__tab--select-mode',
          showInlineEmptyState && 'collection__tab--empty-with-summary'
        )}
      >
        <div className="user-dashboard__section">
          <div className="user-dashboard__albums-list">
            {billingScreen !== 'NONE' ? (
              <CollectionBillingSummary
                screen={billingScreen}
                billing={billing}
                overlays={billingOverlays}
                slotsUsed={slotsUsed}
                lang={lang}
                copy={billingCopy}
                changePlanLoading={renewLoading}
                bannerActionLoading={renewLoading || autoRenewPatchLoading}
                cancelScheduledDowngradeLoading={autoRenewPatchLoading}
                autoRenewActionsEnabled={autoRenewActionsEnabled}
                onChangePlan={handleChangePlan}
                onBannerAction={() => void handleBillingBannerAction()}
                onUpgradePlan={handleUpgradePlan}
                onCancelScheduledDowngrade={() => void handleCancelScheduledDowngrade()}
                onDisableAutoRenew={
                  autoRenewActionsEnabled && billingScreen === 'ACTIVE' && billing.autoRenewEnabled
                    ? handleDisableAutoRenew
                    : undefined
                }
              />
            ) : null}

            {error ? (
              <div className="collection__error" role="alert">
                {error}
              </div>
            ) : null}

            {showInlineEmptyState ? (
              <CollectionEmptyState ui={ui} embedded />
            ) : data ? (
              <DashboardCard className="collection__list-card">
                {inactiveCount > 0 ? (
                  <div className="collection__inactive-toolbar">
                    <span className="collection__inactive-toolbar-count">
                      {inactiveArtistsLabel.replace('{count}', String(inactiveCount))}
                    </span>
                    <div className="collection__inactive-toolbar-actions">
                      <DashboardButton
                        variant="outline"
                        destructive
                        disabled={Boolean(removingId) || bulkLoading}
                        onClick={() => void handleClearInactiveCollection()}
                      >
                        {clearCollectionLabel}
                      </DashboardButton>
                      <DashboardButton variant="outline" onClick={toggleSelectMode}>
                        {isSelectMode ? cancelSelectLabel : selectModeLabel}
                      </DashboardButton>
                    </div>
                  </div>
                ) : null}

                <div className="collection__list">
                  {(data?.artists ?? []).map((artist) => {
                    const artistHref = artist.slug
                      ? `/?artist=${encodeURIComponent(artist.slug)}`
                      : '/';
                    const actionBusy = Boolean(removingId) || bulkLoading || Boolean(activatingId);
                    const isSelected = selectedIds.has(artist.artistUserId);
                    const isInactiveSelectable = isSelectMode && !artist.isActive;
                    const activateRowDisabled =
                      Boolean(activatingId) ||
                      bulkLoading ||
                      Boolean(removingId) ||
                      !hasPremiumAccess ||
                      slotsRemaining <= 0;
                    const activateRowLabel =
                      slotsRemaining <= 0 || !hasPremiumAccess
                        ? `${activateArtistLabel}. ${activateLimitTemplate.replace('{count}', String(slotsRemaining))}`
                        : activateArtistLabel;

                    return (
                      <div
                        key={artist.id}
                        className={clsx(
                          'collection__artist-row-wrap',
                          isInactiveSelectable && 'collection__artist-row-wrap--selectable'
                        )}
                        onClick={
                          isInactiveSelectable
                            ? () => {
                                toggleSelected(artist.artistUserId);
                              }
                            : undefined
                        }
                        onKeyDown={
                          isInactiveSelectable
                            ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  toggleSelected(artist.artistUserId);
                                }
                              }
                            : undefined
                        }
                        role={isInactiveSelectable ? 'button' : undefined}
                        tabIndex={isInactiveSelectable ? 0 : undefined}
                      >
                        <article
                          className={clsx(
                            'collection__artist-row',
                            isSelected && 'collection__artist-row--selected',
                            (isInactiveSelectable || !isSelectMode) &&
                              'collection__artist-row--with-trailing-action'
                          )}
                        >
                          <div className="collection__cover">
                            {artist.cover ? (
                              <img src={artist.cover} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <span className="collection__cover-fallback" aria-hidden>
                                {artist.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>

                          <h3
                            className={clsx(
                              'collection__name',
                              !artist.isActive && 'collection__name--inactive'
                            )}
                          >
                            {artist.isActive ? (
                              <Link to={artistHref} onClick={(event) => event.stopPropagation()}>
                                {artist.name}
                              </Link>
                            ) : (
                              artist.name
                            )}
                          </h3>

                          {isInactiveSelectable ? (
                            <span className="collection__select-checkbox" aria-hidden>
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                            </span>
                          ) : !isSelectMode ? (
                            <div className="collection__row-actions">
                              {!artist.isActive ? (
                                <DashboardButton
                                  variant="icon"
                                  className="collection__activate-action"
                                  disabled={activateRowDisabled}
                                  aria-label={activateRowLabel}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleActivateArtist(artist);
                                  }}
                                >
                                  <PlusIcon {...dashboardActionIconProps()} />
                                </DashboardButton>
                              ) : null}
                              <CollectionArtistRemoveAction
                                artist={artist}
                                hasPremiumAccess={hasPremiumAccess}
                                lang={lang}
                                removeLabel={removeLabel}
                                removeSubscriptionTooltip={removeSubscriptionTooltip}
                                removeLockedPeriodHint={removeLockedPeriodHint}
                                actionBusy={actionBusy}
                                onRemove={handleRemove}
                              />
                            </div>
                          ) : null}
                        </article>
                      </div>
                    );
                  })}
                </div>

                {isSelectMode ? (
                  <footer className="collection__action-bar">
                    <div className="collection__action-bar-meta">
                      <p className="collection__action-bar-count">
                        {selectedCountLabel.replace('{count}', String(selectedCount))}
                      </p>
                      {slotsRemaining > 0 ? (
                        <p className="collection__action-bar-hint">
                          {selectHintTemplate.replace('{count}', String(slotsRemaining))}
                        </p>
                      ) : null}
                    </div>
                    <div className="collection__action-bar-buttons">
                      <DashboardButton
                        variant="outline"
                        destructive
                        disabled={removeSelectedDisabled}
                        onClick={() => void handleBulkRemove()}
                      >
                        {removeSelectedLabel}
                      </DashboardButton>
                      <DashboardButton
                        variant="primary"
                        disabled={activateDisabled}
                        onClick={() => void handleActivateSelected()}
                      >
                        {activateSelectedTemplate.replace('{count}', String(activateCount))}
                      </DashboardButton>
                    </div>
                  </footer>
                ) : null}
              </DashboardCard>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
