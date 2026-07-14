import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  ArchiveApiError,
  activateArchiveArtistsApi,
  getMyArchive,
  removeArtistFromArchiveApi,
  type MyArchiveArtist,
  type MyArchiveData,
} from '@shared/api/archive';
import {
  canRemoveCollectionArtist,
  normalizeCollectionArchive,
} from '@shared/lib/archive/collectionLock';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { CheckSquare, Plus as PlusIcon, Square } from 'lucide-react';
import {
  dispatchArchiveArtistRemoved,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { getPlanDisplayName, resolveCurrentPlanSlug } from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';

import { CollectionArtistRemoveAction } from './CollectionArtistRemoveAction';
import { CollectionEmptyState } from './CollectionEmptyState';
import { ArchiveArtistRemovedToast } from '@shared/ui/archiveArtistRemovedToast';
import { queueArchiveArtistRemovedToast } from '@shared/lib/archiveArtistRemovedToast';
import {
  formatCollectionRenewalDate,
  formatSubscriptionDaysRemainingLabel,
  getSubscriptionDaysRemaining,
  resolveCollectionSubscriptionStatus,
} from './lib/collectionSubscriptionStatus';
import './MyArchiveContent.scss';

type RemovalToastKind = 'single' | 'bulk' | 'cleared';

function canRemoveArtist(artist: MyArchiveArtist, isPremium: boolean): boolean {
  return canRemoveCollectionArtist(artist, isPremium);
}

type Props = {
  active: boolean;
  onContentReady?: () => void;
  onContentBusy?: () => void;
};

export function MyArchiveContent({ active, onContentReady, onContentBusy }: Props) {
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
  const [removedToastTrigger, setRemovedToastTrigger] = useState(0);
  const skipNextArchiveReloadRef = useRef(false);
  const loadErrorTextRef = useRef<string | null>(null);
  const onContentReadyRef = useRef(onContentReady);
  const onContentBusyRef = useRef(onContentBusy);

  const t = ui?.dashboard?.archive;
  loadErrorTextRef.current = t?.loadError ?? null;
  onContentReadyRef.current = onContentReady;
  onContentBusyRef.current = onContentBusy;

  const showRemovalToast = useCallback(
    (kind: RemovalToastKind, count = 1) => {
      let message: string;
      if (kind === 'cleared') {
        message =
          t?.collectionClearedToast ?? (lang === 'en' ? 'Collection cleared' : 'Коллекция очищена');
      } else if (kind === 'single') {
        message =
          t?.artistRemovedToast ??
          (lang === 'en' ? 'Artist removed from collection' : 'Артист удалён из коллекции');
      } else {
        message = (
          t?.artistsRemovedToast ??
          (lang === 'en'
            ? '{count} artists removed from collection'
            : '{count} артистов удалено из коллекции')
        ).replace('{count}', String(count));
      }
      queueArchiveArtistRemovedToast(message);
      setRemovedToastTrigger((value) => value + 1);
    },
    [lang, t?.artistRemovedToast, t?.artistsRemovedToast, t?.collectionClearedToast]
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
          : (loadErrorTextRef.current ??
              (lang === 'en' ? 'Failed to load collection' : 'Не удалось загрузить коллекцию'))
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
  const isPremium = data?.isPremium ?? false;
  const planSlug = useMemo(
    () => (data ? resolveCurrentPlanSlug({ isPremium, slotsLimit, slotsUsed }) : null),
    [data, isPremium, slotsLimit, slotsUsed]
  );
  const slotsRemaining = Math.max(0, slotsLimit - slotsUsed);
  const subscriptionExpiresAt = data?.subscriptionExpiresAt ?? null;
  const subscriptionStatus = useMemo(() => {
    if (!data || !planSlug) return null;

    const resolved = resolveCollectionSubscriptionStatus({
      isPremium,
      expiresAt: subscriptionExpiresAt,
    });
    if (resolved) return resolved;
    return isPremium ? 'active' : 'expired';
  }, [data, isPremium, planSlug, subscriptionExpiresAt]);
  const renewalDateLabel = useMemo(() => {
    if (!subscriptionExpiresAt) return null;
    return formatCollectionRenewalDate(subscriptionExpiresAt, lang);
  }, [lang, subscriptionExpiresAt]);
  const daysRemainingLabel = useMemo(() => {
    if (!subscriptionExpiresAt || subscriptionStatus === 'expired') return null;
    return formatSubscriptionDaysRemainingLabel(
      getSubscriptionDaysRemaining(subscriptionExpiresAt),
      lang
    );
  }, [lang, subscriptionExpiresAt, subscriptionStatus]);

  const slotsProgress = useMemo(() => {
    if (slotsLimit <= 0) return 0;
    return Math.min(100, Math.round((slotsUsed / slotsLimit) * 100));
  }, [slotsLimit, slotsUsed]);

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
          err instanceof Error
            ? err.message
            : (t?.removeError ??
                (lang === 'en' ? 'Failed to remove artists' : 'Не удалось удалить артистов'))
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
    if (removingId || bulkLoading || !canRemoveArtist(artist, isPremium)) return;

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
              (lang === 'en'
                ? 'This artist is locked until the end of your billing period.'
                : 'Этот артист заблокирован до конца оплаченного периода.'))
            : err.code === 'ARCHIVE_SUBSCRIPTION_REQUIRED'
              ? (t?.removeRequiresSubscriptionError ??
                (lang === 'en'
                  ? 'An active subscription is required to remove artists.'
                  : 'Для удаления артистов нужна активная подписка.'))
              : err.message
          : err instanceof Error
            ? err.message
            : (t?.removeError ??
              (lang === 'en' ? 'Failed to remove artist' : 'Не удалось удалить артиста'));
      setError(message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleBulkRemove = async () => {
    if (!data || bulkLoading || selectedIds.size === 0) return;

    const toRemove = data.artists.filter(
      (artist) => selectedIds.has(artist.artistUserId) && canRemoveArtist(artist, isPremium)
    );
    await removeArtistsList(toRemove, 'bulk');
  };

  const handleClearInactiveCollection = async () => {
    if (!data || bulkLoading || removingId) return;

    const toRemove = data.artists.filter(
      (artist) => !artist.isActive && canRemoveArtist(artist, isPremium)
    );
    await removeArtistsList(toRemove, 'cleared');
  };

  const handleActivateSelected = async () => {
    if (!data || bulkLoading || selectedIds.size === 0 || !isPremium) return;

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
      if (!data || bulkLoading || activatingId || artistUserIds.length === 0 || !isPremium) {
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
              ? (
                  t?.activateLimitError ??
                  (lang === 'en'
                    ? 'You can activate up to {count} artists.'
                    : 'Можно активировать не более {count} артистов.')
                ).replace('{count}', String(slotsRemaining))
              : err.message
            : err instanceof Error
              ? err.message
              : (t?.activateError ??
                (lang === 'en'
                  ? 'Failed to activate artists'
                  : 'Не удалось активировать артистов'));
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

  const handleRenewSubscription = useCallback(async () => {
    if (renewLoading || bulkLoading) return;

    if (!planSlug) {
      openSupportModal();
      return;
    }

    setRenewLoading(true);
    setError(null);

    const result = await startCheckout(planSlug);

    if (!result.ok) {
      setError(result.error);
      setRenewLoading(false);
    }
  }, [bulkLoading, openSupportModal, planSlug, renewLoading, startCheckout]);

  const slotsUsedLabel =
    t?.activeSlotsLabel ?? (lang === 'en' ? 'slots used' : 'слотов использовано');
  const removeLabel = t?.remove ?? (lang === 'en' ? 'Remove' : 'Удалить');
  const removeLockedPeriodHint =
    t?.removeLockedPeriodHint ??
    (lang === 'en'
      ? 'Each artist is locked in your collection for 30 days after being added.'
      : 'Каждый артист закрепляется в коллекции на 30 дней после добавления.');
  const removeSubscriptionTooltip =
    t?.removeSubscriptionTooltip ??
    (lang === 'en'
      ? 'An active subscription is required to remove active artists.'
      : 'Для удаления активных артистов нужна активная подписка.');
  const supportInactiveDescription =
    t?.subscriptionExpiredDescription ??
    t?.supportInactiveDescription ??
    (lang === 'en'
      ? 'Access to exclusive content is suspended.'
      : 'Доступ к эксклюзивному контенту приостановлен.');
  const renewSupportLabel =
    t?.renewSupportButton ??
    ui?.buttons?.artistCollectionRenew ??
    (lang === 'en' ? 'Renew subscription' : 'Продлить подписку');
  const changePlanLabel = t?.changePlanButton ?? (lang === 'en' ? 'Change plan' : 'Сменить план');
  const planSectionLabel = t?.planSectionLabel ?? (lang === 'en' ? 'Plan' : 'План');
  const subscriptionSectionLabel =
    t?.subscriptionSectionLabel ?? (lang === 'en' ? 'Subscription' : 'Подписка');
  const subscriptionExpiredStatusLabel =
    t?.subscriptionExpiredStatus ?? (lang === 'en' ? 'Expired' : 'Истекла');
  const renewalDateTemplate =
    t?.subscriptionRenewalDate ?? (lang === 'en' ? 'Valid until {date}' : 'Действует до {date}');
  const selectModeLabel = t?.selectMode ?? (lang === 'en' ? 'Select' : 'Выбрать');
  const cancelSelectLabel = t?.cancelSelect ?? (lang === 'en' ? 'Done' : 'Готово');
  const selectedCountLabel =
    t?.selectedCount ?? (lang === 'en' ? '{count} selected' : 'Выбрано: {count}');
  const removeSelectedLabel =
    t?.removeSelected ?? (lang === 'en' ? 'Remove from collection' : 'Удалить из коллекции');
  const activateSelectedTemplate =
    t?.activateSelected ?? (lang === 'en' ? 'Activate ({count})' : 'Активировать ({count})');
  const activateArtistLabel = t?.activateArtist ?? (lang === 'en' ? 'Activate' : 'Активировать');
  const activateLimitTemplate =
    t?.activateLimitError ??
    (lang === 'en'
      ? 'You can activate up to {count} artists.'
      : 'Можно активировать не более {count} артистов.');
  const selectHintTemplate =
    t?.selectActivateHint ??
    (lang === 'en' ? 'You can select up to {count} artists' : 'Можно выбрать до {count} артистов');
  const inactiveArtistsLabel =
    t?.inactiveArtistsCount ??
    (lang === 'en' ? '{count} inactive artists' : 'Неактивных артистов: {count}');
  const clearCollectionLabel =
    t?.clearCollection ?? (lang === 'en' ? 'Clear collection' : 'Очистить коллекцию');

  const selectedCount = selectedIds.size;
  const selectedInactiveCount =
    data?.artists.filter((a) => selectedIds.has(a.artistUserId) && !a.isActive).length ?? 0;
  const activateCount = Math.min(selectedInactiveCount, slotsRemaining);
  const activateDisabled =
    bulkLoading || activateCount === 0 || selectedInactiveCount === 0 || !isPremium;
  const removeSelectedDisabled =
    bulkLoading ||
    selectedCount === 0 ||
    !data?.artists.some((a) => selectedIds.has(a.artistUserId) && canRemoveArtist(a, isPremium));

  const isCollectionEmpty = (data?.artists.length ?? 0) === 0;
  const showCollectionEmptyState = Boolean(
    data && !loading && !error && !isPremium && isCollectionEmpty
  );
  // Пока идёт загрузка или нет данных — не рисуем summary «0 / 3» (пустая оболочка).
  // Parent показывает DashboardLoadingState через onContentBusy / !archiveContentReady.
  const shouldBlockShell = !hasLoadedOnce || loading || (!data && !error);

  if (shouldBlockShell) {
    return <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />;
  }

  if (showCollectionEmptyState) {
    return (
      <>
        <section className="collection__tab collection__tab--empty">
          <CollectionEmptyState ui={ui} />
        </section>
        <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />
      </>
    );
  }

  return (
    <>
      <section className={clsx('collection__tab', isSelectMode && 'collection__tab--select-mode')}>
        <div className="user-dashboard__section">
          <div className="user-dashboard__albums-list">
            <DashboardCard className="collection__summary-card">
              <header
                className={clsx(
                  'collection__summary',
                  subscriptionStatus && `collection__summary--${subscriptionStatus}`
                )}
              >
                <div className="collection__summary-column collection__summary-plan">
                  <h3 className="collection__summary-column-title">{planSectionLabel}</h3>
                  {planSlug ? (
                    <p className="collection__summary-value-title">
                      {getPlanDisplayName(planSlug)}
                    </p>
                  ) : null}
                  <div className="collection__summary-description">
                    <p className="collection__summary-slots">
                      <span className="collection__summary-slots-count" aria-live="polite">
                        {slotsUsed} / {slotsLimit}
                      </span>{' '}
                      {slotsUsedLabel}
                    </p>
                    <div
                      className="collection__summary-slots-progress"
                      aria-hidden
                      style={
                        { '--collection-slots-progress': `${slotsProgress}%` } as CSSProperties
                      }
                    >
                      <span className="collection__summary-slots-progress-fill" />
                    </div>
                  </div>
                  <div className="collection__summary-action">
                    <DashboardButton variant="outline" onClick={() => openSupportModal()}>
                      {changePlanLabel}
                    </DashboardButton>
                  </div>
                </div>

                {subscriptionStatus ? (
                  <div className="collection__summary-column collection__summary-subscription">
                    <h3 className="collection__summary-column-title">{subscriptionSectionLabel}</h3>
                    {subscriptionStatus === 'expired' ? (
                      <>
                        <p className="collection__summary-value-title collection__summary-value-title--expired">
                          <span className="collection__summary-expired-dot" aria-hidden />
                          {subscriptionExpiredStatusLabel}
                        </p>
                        <div className="collection__summary-description">
                          <p className="collection__summary-description-text">
                            {supportInactiveDescription}
                          </p>
                        </div>
                        <div className="collection__summary-action">
                          <DashboardButton
                            variant="outline"
                            destructive
                            loading={renewLoading}
                            disabled={renewLoading || bulkLoading}
                            onClick={() => void handleRenewSubscription()}
                          >
                            {renewSupportLabel}
                          </DashboardButton>
                        </div>
                      </>
                    ) : (
                      <>
                        {renewalDateLabel ? (
                          <p className="collection__summary-value-title">
                            {renewalDateTemplate.replace('{date}', renewalDateLabel)}
                          </p>
                        ) : null}
                        {daysRemainingLabel ? (
                          <div className="collection__summary-description">
                            <p className="collection__summary-description-text">
                              {daysRemainingLabel}
                            </p>
                          </div>
                        ) : (
                          <div className="collection__summary-description" aria-hidden />
                        )}
                        <div className="collection__summary-action" aria-hidden />
                      </>
                    )}
                  </div>
                ) : null}
              </header>
            </DashboardCard>

            {error ? (
              <div className="collection__error" role="alert">
                {error}
              </div>
            ) : null}

            {data ? (
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
                      !isPremium ||
                      slotsRemaining <= 0;
                    const activateRowLabel =
                      slotsRemaining <= 0 || !isPremium
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
                                isPremium={isPremium}
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
      <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />
    </>
  );
}
