// src/pages/StemsPlayground/StemsPlayground.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Waveform } from '@shared/ui/waveform';
import { useLang } from '@app/providers/lang';
import { getUserAudioUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { StemEngine } from '@audio/stemsEngine';
import { loadStems, getStemAudioUrl, StemIcon, type StemCategory } from '@entities/stem';
import { Text } from '@shared/ui/text';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { fetchAlbums } from '@entities/album/model/albumsSlice';
import { selectAlbumsDataResolved, selectAlbumsStatus } from '@entities/album/model/selectors';
import { getUserUserId } from '@config/user';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { useShowSurfaceAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import './style.scss';

/** Стем, готовый к воспроизведению в плеере (динамический, без фиксированных ключей). */
type PlayableStem = {
  id: string;
  name: string;
  category: StemCategory;
  url: string;
};

type Song = {
  id: string;
  title: string;
  mix?: string;
  stems: PlayableStem[];
};

export default function StemsPlayground() {
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const albums = useAppSelector(selectAlbumsDataResolved);
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsLastUpdated = useAppSelector((s) => s.albums.lastUpdated);
  const showAlbumsLoadingShell = useShowSurfaceAlbumsLoadingShell(albumsStatus, albums.length > 0);

  /** Метка момента смены артиста/языка: не строим список из кэша альбомов до свежего fetchAlbums.fulfilled. */
  const stemsSyncEpochRef = useRef(0);

  const [dynamicSongs, setDynamicSongs] = useState<Song[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);

  /** Только треки из альбомов со стемами в Storage (без демо-списка в коде). */
  const SONGS = useMemo(() => {
    if (showAlbumsLoadingShell || loadingSongs) {
      return [];
    }
    return dynamicSongs;
  }, [dynamicSongs, showAlbumsLoadingShell, loadingSongs]);

  const [selectedId, setSelectedId] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  // Мьюты адресуются по id стема (динамический набор).
  const [muted, setMuted] = useState<Record<string, boolean>>({});

  const { pathname } = useLocation();
  const origin =
    (typeof window !== 'undefined' && window.location.origin) || 'https://smolyanoechuchelko.ru';
  const canonical = `${origin}${pathname}`;

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  // Engine
  const engineRef = useRef<StemEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  // Waveform interactions
  const waveWrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  const currentSong = useMemo(() => SONGS.find((s) => s.id === selectedId), [selectedId, SONGS]);

  // Смена артиста/языка: сразу очищаем каталог стемов, чтобы не мигали треки другого артиста
  useEffect(() => {
    stemsSyncEpochRef.current = Date.now();
    setDynamicSongs([]);
    setSelectedId('');
    setLoadingSongs(true);
    dispatch(fetchAlbums({ force: true }));
  }, [dispatch, lang, publicArtistSlug]);

  // Обработчик события обновления обложек стемов
  useEffect(() => {
    const handleStemCoverUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        albumId: string;
        trackId: string;
        stemKey: string;
        url: string | null;
      }>;
      console.log(
        '🔄 [StemsPlayground] Получено событие обновления обложки стема:',
        customEvent.detail
      );

      // Перезагружаем альбомы с force: true для принудительной перезагрузки данных
      // Это вызовет useEffect, который перезагрузит стемы и портреты
      dispatch(fetchAlbums({ force: true }));
    };

    window.addEventListener('stem-cover-updated', handleStemCoverUpdate);

    return () => {
      window.removeEventListener('stem-cover-updated', handleStemCoverUpdate);
    };
  }, [dispatch, lang]);

  // Загружаем стемы для треков из базы (только после актуального fetch альбомов для текущего артиста)
  useEffect(() => {
    if (albumsStatus === 'loading') {
      return;
    }

    if (albumsStatus === 'failed') {
      setLoadingSongs(false);
      setDynamicSongs([]);
      return;
    }

    if (albumsStatus === 'idle') {
      return;
    }

    if (albumsStatus !== 'succeeded') {
      setLoadingSongs(false);
      return;
    }

    if (albumsLastUpdated != null && albumsLastUpdated < stemsSyncEpochRef.current) {
      return;
    }

    if (!albums || albums.length === 0) {
      setDynamicSongs([]);
      setSelectedId('');
      setLoadingSongs(false);
      return;
    }

    const syncAtLoadStart = stemsSyncEpochRef.current;

    const loadStemsForTracks = async () => {
      setLoadingSongs(true);
      const songsWithStems: Song[] = [];

      console.log('🎵 [StemsPlayground] Загрузка стемов для треков из альбомов:', {
        albumsCount: albums.length,
        albums: albums.map((a) => ({ albumId: a.albumId, tracksCount: a.tracks?.length || 0 })),
      });

      for (const album of albums) {
        if (!album.albumId || !album.tracks || album.tracks.length === 0) continue;

        for (const track of album.tracks) {
          const trackId = String(track.id);
          const albumId = album.albumId;

          const storageUserId = (album.userId && String(album.userId).trim()) || getUserUserId();

          if (!storageUserId) {
            console.warn('⚠️ [StemsPlayground] Пропуск трека: нет userId для альбома', {
              albumId,
              trackId,
            });
            continue;
          }

          // Динамический список стемов из манифеста (с миграцией старых проектов).
          const stemMetas = await loadStems(storageUserId, albumId, trackId);

          // Если стемов нет, пропускаем трек
          if (!stemMetas || stemMetas.length === 0) {
            continue;
          }

          // Строим воспроизводимые стемы с публичными URL (сохраняем порядок из манифеста).
          const stems: PlayableStem[] = [];
          for (const meta of stemMetas) {
            const url = getStemAudioUrl(storageUserId, albumId, trackId, meta);
            if (url) {
              stems.push({ id: meta.id, name: meta.name, category: meta.category, url });
            }
          }

          // Если хотя бы один стем доступен, добавляем песню
          if (stems.length > 0) {
            // Формируем URL для микса (полный трек)
            const mixUrl = track.src
              ? optionalMediaSrc(
                  getUserAudioUrl(track.src, true, storageUserId),
                  'StemsPlayground:dynamicMix',
                  { albumId, trackId }
                )
              : undefined;

            songsWithStems.push({
              id: `track-${albumId}-${trackId}`,
              title: track.title || `Track ${trackId}`,
              mix: mixUrl,
              stems,
            });
          }
        }
      }

      if (syncAtLoadStart !== stemsSyncEpochRef.current) {
        return;
      }

      setDynamicSongs(songsWithStems);
      setLoadingSongs(false);

      // Если есть динамические песни, выбираем первую динамическую
      // Если нет динамических, используем первую статическую как fallback
      if (songsWithStems.length > 0) {
        setSelectedId(songsWithStems[0].id);
      } else {
        setSelectedId('');
      }
    };

    loadStemsForTracks();
  }, [albums, albumsStatus, albumsLastUpdated, publicArtistSlug]);

  // Обновляем selectedId при смене списка (не трогаем во время загрузки)
  useEffect(() => {
    if (loadingSongs || showAlbumsLoadingShell) {
      return;
    }
    if (dynamicSongs.length > 0) {
      if (!dynamicSongs.find((s) => s.id === selectedId)) {
        setSelectedId(dynamicSongs[0].id);
      }
    } else {
      setSelectedId('');
    }
  }, [dynamicSongs, selectedId, loadingSongs, showAlbumsLoadingShell]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, []);

  // Создаём/перезагружаем движок при смене трека
  useEffect(() => {
    const song = currentSong;
    if (!song) return;

    // Карта id стема → URL (динамический набор, без фиксированных ключей)
    const validStems: Record<string, string> = {};
    song.stems.forEach((stem) => {
      if (stem.url && stem.url.trim() !== '') {
        validStems[stem.id] = stem.url;
      }
    });

    // Если нет ни одного валидного стема, не создаем движок
    if (Object.keys(validStems).length === 0) {
      console.warn('⚠️ [StemsPlayground] Нет валидных стемов для песни:', song.id, song.title);
      setLoading(false);
      return;
    }

    // Сбрасываем мьюты при смене песни (другой набор стемов)
    setMuted({});

    setLoading(true);
    setLoadProgress(0);

    engineRef.current?.dispose();

    const engine = new StemEngine(validStems);
    engineRef.current = engine;

    (async () => {
      try {
        await engine.loadAll((p) => setLoadProgress(p));
        setLoading(false);
        if (isPlaying) engine.play();
      } catch (error) {
        console.error('❌ [StemsPlayground] Ошибка при загрузке стемов:', error);
        setLoading(false);
      }
    })();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // RAF-цикл для прогресса
  const [time, setTime] = useState({ current: 0, duration: 0 });
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const e = engineRef.current;
      if (e) {
        setTime({ current: e.getCurrentTime(), duration: e.getDuration() });
        if (e.getDuration() > 0 && e.getCurrentTime() + 0.02 >= e.getDuration() && e.isPlaying) {
          setIsPlaying(false);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const progress = time.duration > 0 ? time.current / time.duration : 0;
  const waveformSrc = currentSong?.mix ?? currentSong?.stems[0]?.url;

  // Транспорт
  const togglePlay = async () => {
    const e = engineRef.current;
    if (!e || loading) return;
    if (!isPlaying) {
      await e.play();
      setIsPlaying(true);
    } else {
      await e.pause();
      setIsPlaying(false);
    }
  };

  // Mute по id стема
  const toggleMute = (stemId: string) => {
    const e = engineRef.current;
    if (!e) return;
    setMuted((m) => {
      const next = { ...m, [stemId]: !m[stemId] };
      e.setMuted(stemId, next[stemId]);
      return next;
    });
  };

  // Скраббинг
  const seekToClientX = (clientX: number) => {
    const wrap = waveWrapRef.current;
    const e = engineRef.current;
    if (!wrap || !e || !Number.isFinite(e.getDuration())) return;

    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const newTime = ratio * e.getDuration();

    e.seek(newTime);
    setTime((t) => ({ ...t, current: newTime }));
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    if (loading) return;
    draggingRef.current = true;
    wasPlayingRef.current = isPlaying;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    seekToClientX(evt.clientX);
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    if (!draggingRef.current || loading) return;
    seekToClientX(evt.clientX);
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    draggingRef.current = false;
    evt.currentTarget.releasePointerCapture(evt.pointerId);
    if (wasPlayingRef.current && !isPlaying) return;
  };

  const selectDisabled = isPlaying || loading || showAlbumsLoadingShell || loadingSongs;

  const b = ui?.buttons ?? {};
  const pageTitle = (ui?.stems?.pageTitle as string) ?? '';
  const pageText = (ui?.stems?.text as string) || '';
  const notice = (ui?.stems?.notice as string) || '';

  const labels = {
    play: (b.playButton as string) ?? 'Play',
    pause: (b.pause as string) ?? 'Pause',
    pageTitle,
    pageText,
    notice,
  };

  return (
    <section className="stems-page main-background" aria-label="Блок c миксером">
      <Helmet>
        <title>{labels.pageTitle}</title>
        <meta name="description" content={labels.pageText} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={labels.pageTitle} />
        <meta property="og:description" content={labels.pageText} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={labels.pageTitle} />
        <meta name="twitter:description" content={labels.pageText} />
      </Helmet>

      <div className="wrapper stems__wrapper">
        <h2 className="item-type-a">{labels.pageTitle}</h2>
        <Text className="item-type-a">{labels.pageText}</Text>
        <Text as="span" className="item-type-a notice" aria-label="Важная информация">
          {labels.notice}
        </Text>

        {/* выбор песни */}
        <div className="item">
          <div
            className={clsx('select-control', { 'is-disabled': selectDisabled })}
            aria-disabled={selectDisabled}
          >
            <select
              id="song-select"
              value={SONGS.some((s) => s.id === selectedId) ? selectedId : ''}
              onChange={(e) => setSelectedId(e.target.value)}
              aria-label="Выбор песни"
              disabled={selectDisabled}
            >
              {showAlbumsLoadingShell || loadingSongs ? (
                <option value="" disabled>
                  {lang === 'en' ? 'Loading…' : 'Загрузка…'}
                </option>
              ) : SONGS.length === 0 ? (
                <option value="" disabled>
                  {lang === 'en' ? 'No tracks with stems' : 'Нет треков со стемами'}
                </option>
              ) : (
                SONGS.map((s) => (
                  <option key={s.id} value={s.id} title={s.title}>
                    {s.title}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* транспорт */}
        <div className="item">
          <div className="wrapper-transport-controls">
            <button
              className="btn"
              onClick={togglePlay}
              type="button"
              disabled={loading}
              aria-pressed={isPlaying}
            >
              <span
                className={clsx(isPlaying ? 'icon-controller-pause' : 'icon-controller-play')}
              ></span>
              {isPlaying ? labels.pause : labels.play}
            </button>
          </div>
        </div>

        {/* ВОЛНА или ЛОАДЕР */}
        <div
          ref={waveWrapRef}
          className={clsx('stems__wave-wrap', 'item-type-a', { 'is-loading': loading })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {loading ? (
            <div className="stems__loader in-wave" aria-live="polite" aria-busy="true">
              <div className="stems__loader-bar">
                <div
                  className="stems__loader-fill"
                  style={{ transform: `scaleX(${loadProgress})` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Waveform src={waveformSrc} progress={progress} height={64} />
              <div className="stems__wave-cursor" style={{ left: `${progress * 100}%` }} />
            </>
          )}
        </div>

        {/* мутизаторы стемов (динамический набор) */}
        <div className="stems__grid item-type-a">
          {(currentSong?.stems ?? []).map((stem) => (
            <StemCard
              key={stem.id}
              title={stem.name}
              category={stem.category}
              active={!muted[stem.id]}
              onClick={() => toggleMute(stem.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StemCard({
  title,
  category,
  active,
  disabled = false,
  onClick,
}: {
  title: string;
  category: StemCategory;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx('stem-card', { muted: !active, 'is-disabled': disabled })}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={
        disabled
          ? `${title}: стем не загружен`
          : `${title}: ${active ? 'звук включён' : 'звук выключен (mute)'}`
      }
      title={
        disabled
          ? `${title} — стем не загружен`
          : `${title} — ${active ? 'звук включён' : 'звук выключен (mute)'}`
      }
    >
      <div className="stem-card__img">
        <StemIcon category={category} className="stem-card__icon" />
      </div>
      <div className="stem-card__label">
        <span className="dot" />
        {title}
      </div>
    </button>
  );
}
