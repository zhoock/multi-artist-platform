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
import { Calendar as CalendarIcon, Lock as LockIcon, Trash2 as Trash2Icon } from 'lucide-react';
import { InfoCircleIcon } from '@shared/ui/icons/InfoCircleIcon';
import {
  dispatchArchiveArtistRemoved,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive';

import '../../UserDashboard.style.scss';

function formatArchiveDate(iso: string, lang: 'en' | 'ru'): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function placeholderCooldownDate(lang: 'en' | 'ru'): string {
  const d = new Date();
  d.setDate(d.getDate() + 31);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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
              (lang === 'en' ? 'Failed to load archive' : 'Не удалось загрузить архив'))
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

  const slotsProgress = useMemo(() => {
    if (slotsLimit <= 0) return 0;
    return Math.min(100, Math.round((slotsUsed / slotsLimit) * 100));
  }, [slotsLimit, slotsUsed]);

  const handleRemove = async (artist: MyArchiveArtist) => {
    if (removingId) return;

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
          ? err.message
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
      ? 'Artists in your archive are unlocked across the platform: tracks, articles, stems and album downloads.'
      : 'Артисты в архиве открывают контент на всей платформе: треки, статьи, стемы и скачивание альбомов.');
  const slotsUsedLabel = t?.slotsUsed ?? (lang === 'en' ? 'slots used' : 'слотов занято');
  const inArchiveSince = t?.inArchiveSince ?? (lang === 'en' ? 'In Archive since' : 'В архиве с');
  const removeLabel = t?.remove ?? (lang === 'en' ? 'Remove' : 'Удалить');
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
  const archiveFullLabel = t?.archiveFull ?? (lang === 'en' ? 'Archive Full' : 'Архив заполнен');
  const cooldownInfo =
    t?.cooldownInfo ??
    (lang === 'en'
      ? 'You can change your archived artists once per month.'
      : 'Менять артистов в архиве можно раз в месяц.');
  const cooldownNext =
    t?.cooldownNext?.replace('{date}', placeholderCooldownDate(lang)) ??
    (lang === 'en'
      ? `Next change will be available on ${placeholderCooldownDate(lang)}.`
      : `Следующая смена будет доступна ${placeholderCooldownDate(lang)}.`);
  const cooldownDays =
    t?.cooldownDays?.replace('{days}', '31') ??
    (lang === 'en' ? 'Change available in 31 days' : 'Смена через 31 день');

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
            <span className="user-dashboard__archive-slots-count">
              {slotsUsed} / {slotsLimit}
            </span>
            <span className="user-dashboard__archive-slots-label">{slotsUsedLabel}</span>
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
          {t?.loading ?? (lang === 'en' ? 'Loading archive…' : 'Загрузка архива…')}
        </div>
      ) : (
        <div className="user-dashboard__archive-list">
          {(data?.artists ?? []).map((artist) => {
            const isRemoving = removingId === artist.artistUserId;
            const genre = artist.genreLabel[lang] ?? artist.genreLabel.en;
            const artistHref = artist.slug ? `/?artist=${encodeURIComponent(artist.slug)}` : '/';

            return (
              <article key={artist.id} className="user-dashboard__archive-card">
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
                  <p className="user-dashboard__archive-card-since">
                    <span aria-hidden>✓</span> {inArchiveSince}{' '}
                    {formatArchiveDate(artist.addedAt, lang)}
                  </p>
                </div>

                <button
                  type="button"
                  className="user-dashboard__archive-remove"
                  disabled={Boolean(removingId)}
                  aria-busy={isRemoving}
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
              </div>
            </article>
          )}
        </div>
      )}

      <footer className="user-dashboard__archive-info">
        <p className="user-dashboard__archive-info-text">
          <InfoCircleIcon className="user-dashboard__archive-info-icon" size={14} />
          {cooldownInfo} {cooldownNext}
        </p>
        <p className="user-dashboard__archive-info-days">
          <CalendarIcon
            {...dashboardActionIconProps({
              size: 14,
              className: 'user-dashboard__archive-info-calendar',
            })}
          />
          {cooldownDays}
        </p>
      </footer>
    </section>
  );
}
