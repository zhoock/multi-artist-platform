import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  ArchiveApiError,
  getMyArchive,
  removeArtistFromArchiveApi,
  type MyArchiveArtist,
  type MyArchiveData,
} from '@shared/api/archive';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { Lock as LockIcon, Trash2 as Trash2Icon, Unlock as UnlockIcon } from 'lucide-react';
import {
  dispatchArchiveArtistRemoved,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive';
import {
  isCollectionOverPlanLimit,
  resolveCurrentPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionPlanBadge } from '@shared/ui/subscriptionPlan';

import '../../UserDashboard.style.scss';

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

type Props = {
  active: boolean;
};

export function MyArchiveContent({ active }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [data, setData] = useState<MyArchiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const t = ui?.dashboard?.archive;

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMyArchive();
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
  const slotsRemaining = Math.max(0, slotsLimit - slotsUsed);
  const isFull = slotsRemaining === 0;
  const isPremium = data?.isPremium ?? false;
  const planSlug = useMemo(
    () => (data ? resolveCurrentPlanSlug({ isPremium, slotsLimit, slotsUsed }) : null),
    [data, isPremium, slotsLimit, slotsUsed]
  );
  const isOverPlanLimit = isCollectionOverPlanLimit(slotsUsed, slotsLimit);

  const slotsProgress = useMemo(() => {
    if (slotsLimit <= 0) return 0;
    return Math.min(100, Math.round((slotsUsed / slotsLimit) * 100));
  }, [slotsLimit, slotsUsed]);

  const handleRemove = async (artist: MyArchiveArtist) => {
    if (removingId || artist.isLocked || !isPremium) return;

    const previous = data;
    if (previous) {
      setData({
        ...previous,
        artists: previous.artists.filter((a) => a.artistUserId !== artist.artistUserId),
        slotsUsed: Math.max(0, previous.slotsUsed - 1),
      });
    }

    setRemovingId(artist.artistUserId);
    setError(null);

    try {
      const { archive } = await removeArtistFromArchiveApi(artist.artistUserId);
      setData(archive);
      dispatchArchiveArtistRemoved(artist.artistUserId, artist.slug || undefined);
      refreshPremiumContentForArchiveChange(dispatch, artist.slug || undefined);
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

  const subtitle =
    t?.subtitle ??
    (lang === 'en'
      ? 'Artists in your collection unlock content across the platform: tracks, articles, stems and album downloads.'
      : 'Артисты в коллекции открывают контент на всей платформе: треки, статьи, стемы и скачивание альбомов.');
  const slotsUsedLabel =
    t?.slotsUsed ?? (lang === 'en' ? 'collection slots used' : 'слотов коллекции занято');
  const inArchiveSince =
    t?.inArchiveSince ?? (lang === 'en' ? 'In Collection since' : 'В коллекции с');
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
  const removeLockedTooltip =
    t?.removeLockedTooltip ??
    (lang === 'en'
      ? 'This artist is locked until the end of the billing period.'
      : 'Артист заблокирован до конца оплаченного периода.');
  const removeSubscriptionTooltip =
    t?.removeSubscriptionTooltip ??
    (lang === 'en'
      ? 'An active subscription is required to remove artists.'
      : 'Для удаления нужна активная подписка.');
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
  const archiveFullHint =
    t?.archiveFullHint ??
    (lang === 'en'
      ? 'Remove an artist when their lock expires to free a slot.'
      : 'Удалите артиста после окончания блокировки, чтобы освободить слот.');
  const collectionOverageHint =
    t?.collectionOverageHint ??
    (lang === 'en'
      ? 'Collection exceeds current plan limit'
      : 'Коллекция превышает лимит текущего плана');

  const slotsAvailableText =
    slotsRemaining === 1
      ? slotAvailable.replace('{count}', '1')
      : slotsAvailablePlural.replace('{count}', String(slotsRemaining));

  return (
    <section className="user-dashboard__archive-tab">
      <header className="user-dashboard__archive-header">
        <div className="user-dashboard__archive-header-text">
          <p className="user-dashboard__archive-subtitle">{subtitle}</p>
        </div>

        <div className="user-dashboard__archive-slots-card" aria-live="polite">
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
              <span className="user-dashboard__archive-slots-count">
                {slotsUsed} / {slotsLimit}
              </span>
              {planSlug ? <SubscriptionPlanBadge planSlug={planSlug} /> : null}
            </div>
            <span className="user-dashboard__archive-slots-label">{slotsUsedLabel}</span>
            {isOverPlanLimit ? (
              <span className="user-dashboard__archive-slots-overage">{collectionOverageHint}</span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="user-dashboard__archive-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="user-dashboard__archive-loading" aria-busy="true">
          {t?.loading ?? (lang === 'en' ? 'Loading collection…' : 'Загрузка коллекции…')}
        </div>
      ) : (
        <div className="user-dashboard__archive-list">
          {(data?.artists ?? []).map((artist) => {
            const isRemoving = removingId === artist.artistUserId;
            const genre = artist.genreLabel[lang] ?? artist.genreLabel.en;
            const artistHref = artist.slug ? `/?artist=${encodeURIComponent(artist.slug)}` : '/';
            const lockDate = formatLockDate(artist.lockedUntil, lang);
            const canRemove = isPremium && !artist.isLocked;
            const removeDisabled = Boolean(removingId) || !canRemove;
            const removeTooltip = !isPremium
              ? removeSubscriptionTooltip
              : artist.isLocked
                ? removeLockedTooltip
                : undefined;

            return (
              <article
                key={artist.id}
                className={`user-dashboard__archive-card${
                  artist.isLocked ? ' user-dashboard__archive-card--locked' : ''
                }`}
              >
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
                    <Link to={artistHref}>{artist.name}</Link>
                  </h3>
                  <span className="user-dashboard__archive-card-genre">{genre}</span>

                  {artist.isLocked && lockDate ? (
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

                <button
                  type="button"
                  className={`user-dashboard__archive-remove${
                    removeDisabled ? ' user-dashboard__archive-remove--disabled' : ''
                  }`}
                  disabled={removeDisabled}
                  aria-busy={isRemoving}
                  title={removeTooltip}
                  aria-label={removeTooltip ? `${removeLabel}. ${removeTooltip}` : removeLabel}
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
              </article>
            );
          })}

          {!isFull ? (
            <article className="user-dashboard__archive-card user-dashboard__archive-card--empty">
              <div className="user-dashboard__archive-card-body user-dashboard__archive-card-body--empty">
                <p className="user-dashboard__archive-empty-title">+ {slotsAvailableText}</p>
                <p className="user-dashboard__archive-empty-hint">{emptySlotHint}</p>
              </div>
              <Link className="user-dashboard__archive-discover" to="/">
                {discoverLabel}
              </Link>
            </article>
          ) : (
            <article className="user-dashboard__archive-card user-dashboard__archive-card--full">
              <div className="user-dashboard__archive-card-body user-dashboard__archive-card-body--empty">
                <p className="user-dashboard__archive-empty-title">
                  <LockIcon
                    {...dashboardActionIconProps({
                      size: 16,
                      className: 'user-dashboard__archive-inline-icon',
                    })}
                  />{' '}
                  {archiveFullLabel}
                </p>
                <p className="user-dashboard__archive-empty-hint">{archiveFullHint}</p>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
