import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
  isCollectionArtistLocked,
  normalizeCollectionArchive,
} from '@shared/lib/archive/collectionLock';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  CheckSquare,
  Lock as LockIcon,
  Square,
  Trash2 as Trash2Icon,
  Unlock as UnlockIcon,
} from 'lucide-react';
import {
  dispatchArchiveArtistRemoved,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { resolveCurrentPlanSlug } from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionPlanBadge } from '@shared/ui/subscriptionPlan';

import { CollectionEmptyState } from './CollectionEmptyState';
import { ArchiveArtistRemovedToast } from '@shared/ui/archiveArtistRemovedToast';
import { queueArchiveArtistRemovedToast } from '@shared/lib/archiveArtistRemovedToast';
import '../../UserDashboard.style.scss';

type RemovalToastKind = 'single' | 'bulk' | 'cleared';

function formatArchiveDate(iso: string, lang: 'en' | 'ru'): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatLockDate(iso: string | null, lang: 'en' | 'ru'): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function canRemoveArtist(artist: MyArchiveArtist, isPremium: boolean): boolean {
  return canRemoveCollectionArtist(artist, isPremium);
}

type Props = {
  active: boolean;
};

export function MyArchiveContent({ active }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openSupportModal } = useArchiveAccessModal();

  const [data, setData] = useState<MyArchiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [removedToastTrigger, setRemovedToastTrigger] = useState(0);

  const t = ui?.dashboard?.archive;

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
    setError(null);
    try {
      const next = normalizeCollectionArchive(await getMyArchive());
      setData(next);
    } catch (err) {
      console.error('[MyArchiveContent] load failed', err);
      setError(
        err instanceof Error
          ? err.message
          : (t?.loadError ??
              (lang === 'en' ? 'Failed to load collection' : 'Не удалось загрузить коллекцию'))
      );
    } finally {
      setLoading(false);
    }
  }, [lang, t?.loadError]);

  useEffect(() => {
    if (!active) return;
    void loadArchive();
  }, [active, loadArchive]);

  useEffect(() => {
    if (!active) return;
    const onChanged = () => {
      void loadArchive();
    };
    window.addEventListener('archive:changed', onChanged);
    return () => window.removeEventListener('archive:changed', onChanged);
  }, [active, loadArchive]);

  const slotsUsed = data?.slotsUsed ?? 0;
  const slotsLimit = data?.slotsLimit ?? 3;
  const inactiveCount = data?.inactiveCount ?? data?.artists.filter((a) => !a.isActive).length ?? 0;
  const isFull = slotsUsed >= slotsLimit;
  const isPremium = data?.isPremium ?? false;
  const planSlug = useMemo(
    () => (data ? resolveCurrentPlanSlug({ isPremium, slotsLimit, slotsUsed }) : null),
    [data, isPremium, slotsLimit, slotsUsed]
  );
  const showRenewCard = Boolean(data && !isPremium && planSlug);
  const showUpgradeCard = Boolean(data && isPremium && isFull);
  const showEmptySlotCard = Boolean(data && !isFull && !showRenewCard && inactiveCount === 0);
  const showPlanChangeBanner = Boolean(
    data && isPremium && inactiveCount > 0 && slotsUsed < slotsLimit
  );
  const slotsRemaining = Math.max(0, slotsLimit - slotsUsed);

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

    setBulkLoading(true);
    setError(null);

    try {
      const { archive } = await activateArchiveArtistsApi(toActivate);
      setData(normalizeCollectionArchive(archive));
      window.dispatchEvent(new Event('archive:changed'));
      exitSelectMode();
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
              (lang === 'en' ? 'Failed to activate artists' : 'Не удалось активировать артистов'));
      setError(message);
    } finally {
      setBulkLoading(false);
    }
  };

  const subtitle =
    t?.subtitle ??
    (lang === 'en'
      ? 'Artists in your collection unlock content across the platform: tracks, articles, stems and album downloads.'
      : 'Артисты в коллекции открывают контент на всей платформе: треки, статьи, стемы и скачивание альбомов.');
  const slotsUsedLabel =
    t?.activeSlotsLabel ?? (lang === 'en' ? 'active slots' : 'активных слотов');
  const managePlanLabel =
    t?.managePlanLink ?? (lang === 'en' ? 'Manage Plan →' : 'Управление планом →');
  const inArchiveSince =
    t?.inArchiveSince ?? (lang === 'en' ? 'In collection since' : 'В коллекции с');
  const removeLabel = t?.remove ?? (lang === 'en' ? 'Remove' : 'Удалить');
  const lockedUntilTemplate =
    t?.lockedUntil ?? (lang === 'en' ? 'Locked until {date}' : 'Заблокирован до {date}');
  const lockedHint =
    t?.lockedHint ??
    (lang === 'en'
      ? "You can't remove this artist until the lock expires."
      : 'Нельзя удалить артиста, пока не истечёт блокировка.');
  const canRemoveLabel = t?.canRemoveLabel ?? (lang === 'en' ? 'Can be removed' : 'Можно удалить');
  const canRemoveHint =
    t?.canRemoveHint ??
    (lang === 'en'
      ? 'You can remove this artist at any time.'
      : 'Вы можете удалить этого артиста в любой момент.');
  const inactiveSlotHint =
    t?.inactiveSlotHint ??
    (lang === 'en'
      ? 'This artist no longer uses an active slot.'
      : 'Этот артист больше не занимает активный слот.');
  const removeLockedTooltip =
    t?.removeLockedTooltip ??
    (lang === 'en'
      ? 'This artist is locked until the end of the billing period.'
      : 'Артист заблокирован до конца оплаченного периода.');
  const supportInactiveLabel =
    t?.supportInactiveTitle ?? (lang === 'en' ? 'Support inactive' : 'Поддержка неактивна');
  const removeSubscriptionTooltip =
    t?.removeSubscriptionTooltip ??
    (lang === 'en'
      ? 'An active subscription is required to remove active artists.'
      : 'Для удаления активных артистов нужна активная подписка.');
  const slotAvailable =
    t?.slotAvailable ?? (lang === 'en' ? '{count} slot available' : 'Доступен {count} слот');
  const slotsAvailablePlural =
    t?.slotsAvailablePlural ??
    (lang === 'en' ? '{count} slots available' : 'Доступно {count} слота');
  const emptySlotHint =
    t?.emptySlotHint ??
    (lang === 'en'
      ? 'Add another artist to unlock their exclusive content.'
      : 'Добавьте артиста, чтобы открыть эксклюзивный контент.');
  const discoverLabel =
    t?.discoverArtists ?? (lang === 'en' ? 'Discover Artists' : 'Найти артистов');
  const archiveFullLabel =
    t?.archiveFull ?? (lang === 'en' ? 'Collection Full' : 'Коллекция заполнена');
  const archiveFullSlotsUsedLine = useMemo(() => {
    if (slotsLimit === 1) {
      return (
        t?.archiveFullSlotsUsedSingular ??
        (lang === 'en'
          ? "You've used all 1 collection slot."
          : 'Вы использовали единственный слот коллекции.')
      );
    }
    const template =
      t?.archiveFullSlotsUsedPlural ??
      (lang === 'en'
        ? "You've used all {count} collection slots."
        : 'Вы использовали все {count} слота коллекции.');
    return template.replace('{count}', String(slotsLimit));
  }, [lang, slotsLimit, t?.archiveFullSlotsUsedPlural, t?.archiveFullSlotsUsedSingular]);
  const archiveFullUpgradeActionLine =
    t?.archiveFullUpgradeAction ??
    (lang === 'en'
      ? 'Upgrade your plan to support more artists.'
      : 'Перейдите на более высокий план, чтобы поддерживать больше артистов.');
  const upgradePlanLabel =
    t?.upgradePlanButton ??
    ui?.header?.avatarMenu?.upgradePlan ??
    (lang === 'en' ? 'Upgrade Plan' : 'Улучшить план');
  const supportInactiveDescription =
    t?.supportInactiveDescription ??
    (lang === 'en'
      ? 'Renew support to continue accessing exclusive content and managing your collection.'
      : 'Возобновите поддержку, чтобы получать доступ к эксклюзивному контенту и управлять коллекцией.');
  const renewSupportLabel =
    t?.renewSupportButton ??
    ui?.buttons?.artistCollectionRenew ??
    (lang === 'en' ? 'Renew Support' : 'Продлить поддержку');
  const planChangeBannerText =
    t?.planChangeBanner ??
    (lang === 'en'
      ? 'Your plan changed. Previously supported artists are now inactive. Select up to {count} to support with your current plan.'
      : 'План изменился. Ранее поддерживаемые артисты теперь неактивны. Выберите до {count} для поддержки по текущему плану.');
  const selectModeLabel = t?.selectMode ?? (lang === 'en' ? 'Select' : 'Выбрать');
  const cancelSelectLabel = t?.cancelSelect ?? (lang === 'en' ? 'Done' : 'Готово');
  const selectedCountLabel =
    t?.selectedCount ?? (lang === 'en' ? '{count} selected' : 'Выбрано: {count}');
  const removeSelectedLabel =
    t?.removeSelected ?? (lang === 'en' ? 'Remove from collection' : 'Удалить из коллекции');
  const activateSelectedTemplate =
    t?.activateSelected ?? (lang === 'en' ? 'Activate ({count})' : 'Активировать ({count})');
  const selectHintTemplate =
    t?.selectActivateHint ??
    (lang === 'en' ? 'You can select up to {count} artists' : 'Можно выбрать до {count} артистов');
  const inactiveArtistsLabel =
    t?.inactiveArtistsCount ??
    (lang === 'en' ? '{count} inactive artists' : 'Неактивных артистов: {count}');
  const clearCollectionLabel =
    t?.clearCollection ?? (lang === 'en' ? 'Clear collection' : 'Очистить коллекцию');

  const slotsAvailableText =
    slotsRemaining === 1
      ? slotAvailable.replace('{count}', '1')
      : slotsAvailablePlural.replace('{count}', String(slotsRemaining));

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

  if (loading && !data) {
    return (
      <>
        <section className="user-dashboard__archive-tab">
          <div className="user-dashboard__archive-loading" aria-busy="true">
            {t?.loading ?? (lang === 'en' ? 'Loading collection…' : 'Загрузка коллекции…')}
          </div>
        </section>
        <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />
      </>
    );
  }

  if (showCollectionEmptyState) {
    return (
      <>
        <section className="user-dashboard__archive-tab user-dashboard__archive-tab--empty">
          <CollectionEmptyState ui={ui} />
        </section>
        <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />
      </>
    );
  }

  return (
    <>
      <section
        className={`user-dashboard__archive-tab${
          isSelectMode ? ' user-dashboard__archive-tab--select-mode' : ''
        }`}
      >
        <header className="user-dashboard__archive-header">
          <div className="user-dashboard__archive-header-text">
            <p className="user-dashboard__archive-subtitle">{subtitle}</p>
          </div>

          <div className="user-dashboard__archive-header-actions">
            <button
              type="button"
              className="user-dashboard__archive-slots-card"
              onClick={() => openSupportModal()}
              aria-label={`${slotsUsed} / ${slotsLimit}. ${managePlanLabel}`}
            >
              <div
                className="user-dashboard__archive-slots-ring"
                style={{ '--archive-slots-progress': `${slotsProgress}%` } as CSSProperties}
                aria-hidden
              >
                <LockIcon
                  {...dashboardActionIconProps({
                    size: 18,
                    className: 'user-dashboard__archive-slots-ring-icon',
                  })}
                />
              </div>
              <div className="user-dashboard__archive-slots-meta">
                <div className="user-dashboard__archive-slots-top">
                  <span className="user-dashboard__archive-slots-count" aria-live="polite">
                    {slotsUsed} / {slotsLimit}
                  </span>
                  {planSlug ? <SubscriptionPlanBadge planSlug={planSlug} /> : null}
                </div>
                <span className="user-dashboard__archive-slots-label">{slotsUsedLabel}</span>
                <span className="user-dashboard__archive-slots-manage">{managePlanLabel}</span>
              </div>
            </button>
          </div>
        </header>

        {error ? (
          <div className="user-dashboard__archive-error" role="alert">
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            {showPlanChangeBanner ? (
              <div className="user-dashboard__archive-plan-change-banner" role="status">
                <p>{planChangeBannerText.replace('{count}', String(slotsLimit))}</p>
              </div>
            ) : null}

            {showUpgradeCard ? (
              <div className="user-dashboard__archive-full-banner" role="status">
                <div className="user-dashboard__archive-full-banner-icon" aria-hidden>
                  <LockIcon
                    {...dashboardActionIconProps({
                      size: 18,
                      className: 'user-dashboard__archive-full-banner-icon-svg',
                    })}
                  />
                </div>
                <div className="user-dashboard__archive-full-banner-text">
                  <p className="user-dashboard__archive-full-banner-title">{archiveFullLabel}</p>
                  <p className="user-dashboard__archive-full-banner-line">
                    {archiveFullSlotsUsedLine}
                  </p>
                  <p className="user-dashboard__archive-full-banner-line">
                    {archiveFullUpgradeActionLine}
                  </p>
                </div>
                <button
                  type="button"
                  className="user-dashboard__archive-full-banner-cta"
                  onClick={() => openSupportModal()}
                >
                  {upgradePlanLabel}
                </button>
              </div>
            ) : null}

            {inactiveCount > 0 ? (
              <div className="user-dashboard__archive-inactive-toolbar">
                <span className="user-dashboard__archive-inactive-toolbar-count">
                  {inactiveArtistsLabel.replace('{count}', String(inactiveCount))}
                </span>
                <div className="user-dashboard__archive-inactive-toolbar-actions">
                  <button
                    type="button"
                    className="user-dashboard__archive-clear-collection"
                    disabled={Boolean(removingId) || bulkLoading}
                    onClick={() => void handleClearInactiveCollection()}
                  >
                    <Trash2Icon
                      {...dashboardActionIconProps({
                        size: 14,
                        className: 'user-dashboard__archive-remove-icon',
                      })}
                      aria-hidden
                    />
                    {clearCollectionLabel}
                  </button>
                  <button
                    type="button"
                    className={`user-dashboard__archive-select-toggle${
                      isSelectMode ? ' user-dashboard__archive-select-toggle--active' : ''
                    }`}
                    onClick={toggleSelectMode}
                  >
                    {isSelectMode ? cancelSelectLabel : selectModeLabel}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="user-dashboard__archive-list">
              {(data?.artists ?? []).map((artist) => {
                const isRemoving = removingId === artist.artistUserId;
                const genre = artist.genreLabel[lang] ?? artist.genreLabel.en;
                const artistHref = artist.slug
                  ? `/?artist=${encodeURIComponent(artist.slug)}`
                  : '/';
                const lockDate = formatLockDate(
                  isCollectionArtistLocked(artist) ? artist.lockedUntil : null,
                  lang
                );
                const artistIsLocked = isCollectionArtistLocked(artist);
                const removable = canRemoveArtist(artist, isPremium);
                const removeDisabled = Boolean(removingId) || bulkLoading || !removable;
                const isSelected = selectedIds.has(artist.artistUserId);
                const isInactiveSelectable = isSelectMode && !artist.isActive;
                const removeTooltip = !removable
                  ? artistIsLocked
                    ? removeLockedTooltip
                    : artist.isActive && !isPremium
                      ? removeSubscriptionTooltip
                      : undefined
                  : undefined;

                return (
                  <article
                    key={artist.id}
                    className={`user-dashboard__archive-card${
                      isInactiveSelectable ? ' user-dashboard__archive-card--selectable' : ''
                    }${isSelected ? ' user-dashboard__archive-card--selected' : ''}${
                      !artist.isActive ? ' user-dashboard__archive-card--inactive-artist' : ''
                    }${artistIsLocked ? ' user-dashboard__archive-card--locked' : ''}`}
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
                    {isInactiveSelectable ? (
                      <span className="user-dashboard__archive-select-checkbox" aria-hidden>
                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                      </span>
                    ) : null}

                    <div className="user-dashboard__archive-card-cover">
                      {artist.cover ? (
                        <img src={artist.cover} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="user-dashboard__archive-card-cover-fallback" aria-hidden>
                          {artist.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="user-dashboard__archive-card-body">
                      <h3 className="user-dashboard__archive-card-name">
                        {isInactiveSelectable ? (
                          artist.name
                        ) : (
                          <Link to={artistHref} onClick={(event) => event.stopPropagation()}>
                            {artist.name}
                          </Link>
                        )}
                      </h3>
                      <span className="user-dashboard__archive-card-genre">{genre}</span>

                      {!artist.isActive ? (
                        <div className="user-dashboard__archive-card-lock user-dashboard__archive-card-lock--inactive">
                          <p className="user-dashboard__archive-card-lock-title">
                            <LockIcon
                              {...dashboardActionIconProps({
                                size: 14,
                                className: 'user-dashboard__archive-card-lock-icon',
                              })}
                            />
                            {supportInactiveLabel}
                          </p>
                          <p className="user-dashboard__archive-card-lock-hint">
                            {inactiveSlotHint}
                          </p>
                        </div>
                      ) : artistIsLocked && lockDate ? (
                        <div className="user-dashboard__archive-card-lock">
                          <p className="user-dashboard__archive-card-lock-title">
                            <LockIcon
                              {...dashboardActionIconProps({
                                size: 14,
                                className: 'user-dashboard__archive-card-lock-icon',
                              })}
                            />
                            {lockedUntilTemplate.replace('{date}', lockDate)}
                          </p>
                          <p className="user-dashboard__archive-card-lock-hint">{lockedHint}</p>
                        </div>
                      ) : (
                        <div className="user-dashboard__archive-card-lock user-dashboard__archive-card-lock--unlocked">
                          <p className="user-dashboard__archive-card-lock-title">
                            <UnlockIcon
                              {...dashboardActionIconProps({
                                size: 14,
                                className: 'user-dashboard__archive-card-lock-icon',
                              })}
                            />
                            {canRemoveLabel}
                          </p>
                          <p className="user-dashboard__archive-card-lock-hint">
                            {!isPremium ? removeSubscriptionTooltip : canRemoveHint}
                          </p>
                        </div>
                      )}

                      <p className="user-dashboard__archive-card-since">
                        <span aria-hidden>✓</span> {inArchiveSince}{' '}
                        {formatArchiveDate(artist.addedAt, lang)}
                      </p>
                    </div>

                    {!isSelectMode ? (
                      <button
                        type="button"
                        className={`user-dashboard__archive-remove${
                          removeDisabled ? ' user-dashboard__archive-remove--disabled' : ''
                        }`}
                        disabled={removeDisabled}
                        aria-busy={isRemoving}
                        title={removeTooltip}
                        aria-label={
                          removeTooltip ? `${removeLabel}. ${removeTooltip}` : removeLabel
                        }
                        onClick={() => void handleRemove(artist)}
                      >
                        <Trash2Icon
                          {...dashboardActionIconProps({
                            size: 14,
                            className: 'user-dashboard__archive-remove-icon',
                          })}
                        />
                        {isRemoving
                          ? (t?.removing ?? (lang === 'en' ? 'Removing…' : 'Удаляем…'))
                          : removeLabel}
                      </button>
                    ) : null}
                  </article>
                );
              })}

              {showEmptySlotCard ? (
                <article className="user-dashboard__archive-card user-dashboard__archive-card--empty">
                  <div className="user-dashboard__archive-card-body user-dashboard__archive-card-body--empty">
                    <p className="user-dashboard__archive-empty-title">+ {slotsAvailableText}</p>
                    <p className="user-dashboard__archive-empty-hint">{emptySlotHint}</p>
                  </div>
                  <Link className="user-dashboard__archive-discover" to="/">
                    {discoverLabel}
                  </Link>
                </article>
              ) : null}

              {showRenewCard ? (
                <article className="user-dashboard__archive-card user-dashboard__archive-card--action user-dashboard__archive-card--inactive">
                  <div className="user-dashboard__archive-card-body user-dashboard__archive-card-body--empty">
                    <p className="user-dashboard__archive-empty-title">
                      <LockIcon
                        {...dashboardActionIconProps({
                          size: 16,
                          className: 'user-dashboard__archive-inline-icon',
                        })}
                      />{' '}
                      {supportInactiveLabel}
                    </p>
                    <p className="user-dashboard__archive-empty-hint">
                      {supportInactiveDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="user-dashboard__archive-plan-cta"
                    onClick={() => openSupportModal()}
                  >
                    {renewSupportLabel}
                  </button>
                </article>
              ) : null}
            </div>

            {isSelectMode ? (
              <footer className="user-dashboard__archive-action-bar">
                <div className="user-dashboard__archive-action-bar-meta">
                  <p className="user-dashboard__archive-action-bar-count">
                    {selectedCountLabel.replace('{count}', String(selectedCount))}
                  </p>
                  {slotsRemaining > 0 ? (
                    <p className="user-dashboard__archive-action-bar-hint">
                      {selectHintTemplate.replace('{count}', String(slotsRemaining))}
                    </p>
                  ) : null}
                </div>
                <div className="user-dashboard__archive-action-bar-buttons">
                  <button
                    type="button"
                    className="user-dashboard__archive-action-bar-remove"
                    disabled={removeSelectedDisabled}
                    onClick={() => void handleBulkRemove()}
                  >
                    <Trash2Icon size={14} aria-hidden />
                    {removeSelectedLabel}
                  </button>
                  <button
                    type="button"
                    className="user-dashboard__archive-action-bar-activate"
                    disabled={activateDisabled}
                    onClick={() => void handleActivateSelected()}
                  >
                    <LockIcon size={14} aria-hidden />
                    {activateSelectedTemplate.replace('{count}', String(activateCount))}
                  </button>
                </div>
              </footer>
            ) : null}
          </>
        ) : null}
      </section>
      <ArchiveArtistRemovedToast triggerKey={removedToastTrigger} />
    </>
  );
}
