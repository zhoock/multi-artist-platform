// src/features/editSyncLyrics/ui/EditSyncLyrics.tsx
/**
 * Фича для синхронизации текста песни с музыкой.
 * Позволяет устанавливать тайм-коды для каждой строки текста вручную.
 */
import { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { Pause, Play, X as XIcon } from 'lucide-react';
import { useParams, useLocation } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { Loader } from '@shared/ui/loader';
import { ErrorMessage } from '@shared/ui/error-message';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { playerTransportIconProps } from '@shared/ui/icons/playerActionIcon';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { playerActions, playerSelectors } from '@features/player';
import { audioController } from '@features/player/model/lib/audioController';
import type { SyncedLyricsLine } from '@/models';
import { AlbumCover } from '@entities/album';
import {
  selectDashboardAlbumsStatus,
  selectDashboardAlbumsError,
  selectDashboardAlbumById,
} from '@entities/album';
import {
  buildTranslatedContentEditFallbackNotice,
  collectAlbumEditFallbackSources,
  getTrackSyncedLyricsForEdit,
  resolveTrackFieldForEdit,
  resolveTrackForDisplay,
} from '@entities/album/lib/resolveAlbumDisplay';
import {
  saveSyncedLyrics,
  loadSyncedLyricsFromStorage,
  loadAuthorshipFromStorage,
} from '@features/syncedLyrics/lib';
import { loadTrackTextFromDatabase } from '@entities/track/lib';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import {
  formatAlbumDisplayFullName,
  readStoredProfileDisplayName,
  siteArtistUiLabel,
} from '@shared/lib/profileDisplayName';
import './EditSyncLyrics.style.scss';

interface EditSyncLyricsProps {
  albumId?: string; // Опциональный prop для использования без роутинга
  trackId?: string; // Опциональный prop для использования без роутинга
}

export default function EditSyncLyrics({
  albumId: propAlbumId,
  trackId: propTrackId,
}: EditSyncLyricsProps = {}) {
  const { lang } = useLang();
  const { albumId: paramAlbumId = '', trackId: paramTrackId = '' } = useParams<{
    albumId: string;
    trackId: string;
  }>();
  const location = useLocation();
  const albumId = propAlbumId || paramAlbumId; // Используем prop или param
  const trackId = propTrackId || paramTrackId; // Используем prop или param
  const albumsStatus = useAppSelector(selectDashboardAlbumsStatus);
  const albumsError = useAppSelector(selectDashboardAlbumsError);
  const album = useAppSelector((state) => selectDashboardAlbumById(state, albumId));
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, {
    variant: 'authenticated',
  });

  const dispatch = useAppDispatch();

  // Получаем текущее время из Redux плеера для установки тайм-кодов
  // Используем один селектор selectTime для атомарного получения обоих значений (как в AudioPlayer)
  const time = useAppSelector(playerSelectors.selectTime);
  const currentTime = time; // Алиас для совместимости с остальным кодом
  const isPlaying = useAppSelector(playerSelectors.selectIsPlaying);
  const progress = useAppSelector(playerSelectors.selectProgress);
  const isSeeking = useAppSelector(playerSelectors.selectIsSeeking);

  const [syncedLines, setSyncedLines] = useState<SyncedLyricsLine[]>([]);
  const [isDirty, setIsDirty] = useState(false); // флаг изменений
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null); // для отслеживания смены трека
  const [lastTextHash, setLastTextHash] = useState<string | null>(null); // хэш текста для отслеживания изменений
  const [isSaved, setIsSaved] = useState(false); // флаг успешного сохранения
  const [isLoading, setIsLoading] = useState(true); // флаг загрузки данных
  const [isInteractionLocked, setIsInteractionLocked] = useState(false); // блокировка взаимодействия после завершения
  const initializedRef = useRef<string | null>(null); // ref для отслеживания инициализированного трека
  const durationRef = useRef<number>(0); // ref для стабильного хранения duration
  const albumIdRef = useRef<string>(''); // ref для стабильного хранения albumId
  const loadingRef = useRef<boolean>(false); // ref для предотвращения параллельных загрузок
  const lastRequestKeyRef = useRef<string>(''); // ref для отслеживания последнего запроса

  const [editLocaleFallbackNotice, setEditLocaleFallbackNotice] = useState<string | null>(null);

  // Обновляем albumIdRef при изменении albumId
  useEffect(() => {
    if (albumId && albumId !== albumIdRef.current) {
      albumIdRef.current = albumId;
    }
  }, [albumId]);

  // Обновляем durationRef при изменении currentTime.duration
  useEffect(() => {
    if (currentTime.duration && currentTime.duration !== durationRef.current) {
      durationRef.current = currentTime.duration;
    }
  }, [currentTime.duration]);

  // Инициализируем плейлист в Redux когда загружаются данные альбома
  // ВАЖНО: При загрузке страницы синхронизации останавливаем воспроизведение и сбрасываем время
  useEffect(() => {
    if (!album || albumsStatus !== 'succeeded') return;

    const track = album.tracks.find((t) => String(t.id) === trackId);
    if (!track) return;

    // Останавливаем воспроизведение при загрузке страницы синхронизации
    dispatch(playerActions.pause());
    audioController.pause();

    // Сбрасываем время на 0
    dispatch(playerActions.setCurrentTime(0));
    dispatch(playerActions.setProgress(0));
    audioController.setCurrentTime(0);

    // Устанавливаем плейлист только с одним треком (текущим)
    // Это предотвращает автоматическое переключение на следующий трек
    const currentTrack = album.tracks.find((t) => String(t.id) === trackId);
    if (currentTrack) {
      setIsInteractionLocked(false);
      dispatch(playerActions.setPlaylist([resolveTrackForDisplay(currentTrack, lang)]));
      dispatch(playerActions.setCurrentTrackIndex(0)); // Всегда индекс 0, так как в плейлисте только один трек
      dispatch(
        playerActions.setAlbumInfo({
          albumId: album.albumId || albumId,
          albumTitle: album.album,
        })
      );
      const displayArtist = siteArtistUiLabel(siteArtistName);
      dispatch(
        playerActions.setAlbumMeta({
          albumId: album.albumId || albumId,
          userId: album.userId ?? null,
          album: album.album,
          artist: displayArtist,
          fullName:
            formatAlbumDisplayFullName(
              siteArtistName.trim() || readStoredProfileDisplayName().trim(),
              album.album
            ) || album.album,
          cover: album.cover ?? null,
        })
      );
      dispatch(
        playerActions.setSourceLocation({
          pathname: location.pathname,
          search: location.search || undefined,
        })
      );
      // Явно устанавливаем источник трека, чтобы загрузить метаданные
      // Глобальный обработчик loadedmetadata в playerListeners.ts обновит duration автоматически
      // Устанавливаем autoplay: false, чтобы не запускать автоматически
      if (currentTrack.src) {
        audioController.setSource(currentTrack.src, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumsStatus, albumId, trackId, lang, dispatch, location, siteArtistName]); // album из замыкания

  // Отслеживаем изменения текста в localStorage (для обновления при сохранении в другой вкладке)
  useEffect(() => {
    if (!albumId || !trackId || !lang) return;

    let isChecking = false; // Флаг для предотвращения параллельных проверок

    const checkTextUpdate = async () => {
      // Предотвращаем параллельные проверки
      if (isChecking) return;
      // Не проверяем, если идет основная загрузка
      if (loadingRef.current) return;
      isChecking = true;

      try {
        // Делаем запрос только если данные уже инициализированы
        if (initializedRef.current === null) {
          isChecking = false;
          return;
        }
        const [storedText, storedAuthorship] = await Promise.all([
          loadTrackTextFromDatabase(albumId, trackId, lang),
          loadAuthorshipFromStorage(albumId, trackId, lang),
        ]);
        const textToUse = storedText || '';
        const newHash = `${textToUse}-${storedAuthorship || ''}`;

        // Получаем текущий lastTextHash из состояния
        const currentLastTextHash = lastTextHash;

        // Обновляем только если текст действительно изменился (не при первой загрузке)
        // При первой загрузке данные загружаются в основном рендере
        // Также не обновляем, если данные ещё не инициализированы
        if (
          currentLastTextHash !== null &&
          newHash !== currentLastTextHash &&
          initializedRef.current !== null
        ) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 Текст изменился, обновляем синхронизации:', {
              oldHash: currentLastTextHash,
              newHash,
            });
          }
          setSyncedLines((prev) => {
            // Если текст пустой - очищаем все строки
            if (!textToUse || !textToUse.trim()) {
              return [];
            }

            // Разбиваем новый текст на строки
            const contentLines = textToUse.split('\n').filter((line) => line.trim());
            const textLines = contentLines.map((line) => line.trim());

            // Если текст изменился - обнуляем все таймкоды (создаём новые строки без таймкодов)
            // Это логично: если пользователь редактирует текст, он хочет заново синхронизировать
            const newLines: SyncedLyricsLine[] = textLines.map((text) => ({
              text,
              startTime: 0,
              endTime: undefined,
            }));

            // Authorship должен быть частью syncedLines как обычная строка
            // Не добавляем authorship отдельно - он должен быть частью текста или сохраненных синхронизаций

            return newLines;
          });
          setLastTextHash(newHash);
          setIsDirty(true); // Помечаем как изменённое, чтобы пользователь мог сохранить
          // Сбрасываем initializedRef, чтобы основной useEffect перезагрузил данные
          initializedRef.current = null;
        } else if (currentLastTextHash === null) {
          // При первой загрузке просто устанавливаем хэш, не трогая данные
          // Данные загружаются в основном рендере
          setLastTextHash(newHash);
        }
      } catch (error) {
        console.error('❌ Ошибка при проверке обновления текста:', error);
      } finally {
        isChecking = false;
      }
    };

    // Проверяем сразу (только один раз при монтировании)
    checkTextUpdate();

    // Проверяем каждые 5 секунд (увеличено с 2 до 5, чтобы снизить нагрузку)
    const interval = setInterval(checkTextUpdate, 5000);

    return () => clearInterval(interval);
    // Убрали lastTextHash из зависимостей, чтобы интервал не пересоздавался при каждом изменении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, trackId, lang]); // lastTextHash используется внутри функции через замыкание

  // Инициализация синхронизаций при загрузке данных
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 useEffect запущен:', {
        hasAlbum: !!album,
        albumsStatus,
        albumId,
        trackId,
        currentTrackId,
        initializedRef: initializedRef.current,
      });
    }

    if (albumsStatus !== 'succeeded' || !album) {
      setIsLoading(false);
      return;
    }

    // Проверяем, изменился ли трек, используя initializedRef
    const trackIdStr = trackId;
    const requestKey = `${albumId}-${trackId}-${lang}`;

    // Если трек уже инициализирован - не загружаем заново
    if (initializedRef.current === trackIdStr) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Трек уже инициализирован, пропускаем загрузку');
      }
      setIsLoading(false);
      return;
    }

    // Если уже идет загрузка с теми же параметрами - пропускаем
    if (loadingRef.current && lastRequestKeyRef.current === requestKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏳ Загрузка уже идет, пропускаем повторный запрос');
      }
      return;
    }

    // Если трек изменился (initializedRef не совпадает) - сбрасываем состояние
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Трек изменился или не инициализирован, загружаем данные');
    }

    setIsDirty(false);
    setIsSaved(false);
    setIsLoading(true); // Показываем лоадер при смене трека
    loadingRef.current = true; // Устанавливаем флаг загрузки
    lastRequestKeyRef.current = requestKey; // Сохраняем ключ запроса

    // Используем async функцию для загрузки данных из БД
    let cancelled = false; // Флаг для отмены запроса при размонтировании

    (async () => {
      // Используем текущий album из замыкания
      const currentAlbum = album;
      if (!currentAlbum || cancelled) {
        setIsLoading(false);
        return;
      }

      const currentTrack = currentAlbum.tracks.find((t) => String(t.id) === trackId);
      if (!currentTrack || cancelled) {
        setIsLoading(false);
        return;
      }

      const currentTrackIdStr = String(currentTrack.id);

      const contentResolved = resolveTrackFieldForEdit(currentTrack, 'content', lang);
      const authorshipResolved = resolveTrackFieldForEdit(currentTrack, 'authorship', lang);
      const jsonSyncedResolved = getTrackSyncedLyricsForEdit(currentTrack, lang);

      // Загружаем авторство и синхронизации параллельно
      const [storedAuthorship, storedSync] = await Promise.all([
        loadAuthorshipFromStorage(albumId, currentTrack.id, lang),
        loadSyncedLyricsFromStorage(albumId, currentTrack.id, lang),
      ]);

      // Проверяем, не был ли запрос отменён после await
      if (cancelled) {
        setIsLoading(false);
        return;
      }

      const trackAuthorship = storedAuthorship?.trim()
        ? storedAuthorship
        : authorshipResolved.value;

      // Загружаем сохранённый текст из БД
      const storedText = await loadTrackTextFromDatabase(albumId, currentTrack.id, lang);
      const textToUse = storedText !== null ? storedText : contentResolved.value;

      // Вычисляем хэш текста
      const textHash = `${textToUse}-${trackAuthorship}`;

      // Логирование только в development для отладки
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Инициализация синхронизаций:', {
          albumId,
          trackId: currentTrack.id,
          lang,
          hasStoredSync: !!storedSync,
          storedSyncLength: storedSync?.length || 0,
        });
      }

      // Текст в БД (включая явную пустоту) vs канон JSON с тем же fallback локалей, что на сайте
      const textChanged = storedText !== null && storedText.trim() !== contentResolved.value.trim();

      // Вычисляем хэш текущего текста для сравнения
      const currentTextHash = `${textToUse}-${trackAuthorship}`;

      // Проверяем, изменился ли текст с момента последнего сохранения
      // Если lastTextHash установлен и отличается от текущего - текст изменился
      const textChangedSinceSave = lastTextHash !== null && lastTextHash !== currentTextHash;

      // Также проверяем, совпадает ли текст в сохранённых синхронизациях с текущим текстом
      // Если не совпадает - текст изменился, игнорируем сохранённые синхронизации
      let textMatchesStoredSync = true;
      if (storedSync && storedSync.length > 0) {
        const currentLines = textToUse.split('\n').filter((line) => line.trim());
        const storedLines = storedSync
          .filter((line) => line.text !== trackAuthorship) // Исключаем авторство
          .map((line) => line.text.trim());
        textMatchesStoredSync =
          currentLines.length === storedLines.length &&
          currentLines.every((line, index) => line.trim() === storedLines[index]);
      }

      let linesToDisplay: SyncedLyricsLine[] = [];
      let usedJsonSyncFallback = false;

      // ПРИОРИТЕТ: Если текст изменился после сохранения - игнорируем сохранённые синхронизации
      // Иначе используем сохранённые синхронизации, если они есть
      if (textChangedSinceSave || !textMatchesStoredSync) {
        // Текст изменился после сохранения - создаём новые строки без таймкодов
        if (process.env.NODE_ENV === 'development') {
          console.log('📝 Текст изменился после сохранения, сбрасываем таймкоды', {
            textChangedSinceSave,
            textMatchesStoredSync,
          });
        }
        const contentLines = textToUse.split('\n').filter((line) => line.trim());
        linesToDisplay = contentLines.map((line) => ({
          text: line.trim(),
          startTime: 0,
          endTime: undefined,
        }));
      } else if (storedSync && storedSync.length > 0) {
        // Используем сохранённые в localStorage синхронизации (текст не изменился)
        if (process.env.NODE_ENV === 'development') {
          console.log('📥 Загрузка сохранённых синхронизаций из localStorage:', {
            albumId,
            trackId: currentTrack.id,
            lang,
            linesCount: storedSync.length,
          });
        }
        linesToDisplay = storedSync;
      } else if (textChanged) {
        // Текст изменился И нет сохранённых синхронизаций - создаём новые строки без таймкодов
        console.log('📝 Текст изменился, создаём новые строки без таймкодов');
        const contentLines = textToUse.split('\n').filter((line) => line.trim());
        linesToDisplay = contentLines.map((line) => ({
          text: line.trim(),
          startTime: 0,
          endTime: undefined,
        }));
      } else if (Array.isArray(jsonSyncedResolved.lines) && jsonSyncedResolved.lines.length > 0) {
        // Синхронизации из данных альбома — с тем же fallback по локалям, что на сайте
        if (process.env.NODE_ENV === 'development') {
          console.log('📄 Используем синхронизации из JSON альбома (с fallback локалей)');
        }
        usedJsonSyncFallback = jsonSyncedResolved.isFallback;
        linesToDisplay = jsonSyncedResolved.lines;
      } else {
        // Разбиваем обычный текст на строки
        console.log('📝 Создаём строки из обычного текста');
        const contentLines = textToUse.split('\n').filter((line) => line.trim());
        linesToDisplay = contentLines.map((line) => ({
          text: line.trim(),
          startTime: 0,
          endTime: undefined,
        }));
      }

      // Authorship должен быть частью syncedLyrics как обычная строка
      // Если authorship есть, но отсутствует в linesToDisplay, добавляем его только если он не был сохранен с таймерами
      // НО: если authorship уже есть в linesToDisplay с таймерами, НЕ добавляем его снова
      if (trackAuthorship && trackAuthorship.trim()) {
        const trackAuthorshipTrimmed = trackAuthorship.trim();
        const hasAuthorshipInLines = linesToDisplay.some(
          (line) => line.text.trim() === trackAuthorshipTrimmed
        );

        // Если authorship отсутствует в linesToDisplay, добавляем его только для отображения
        // НО НЕ устанавливаем endTime: duration - пусть пользователь сам установит тайминг
        if (!hasAuthorshipInLines) {
          linesToDisplay.push({
            text: trackAuthorshipTrimmed,
            startTime: 0,
            endTime: undefined,
          });
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Установка синхронизаций:', {
          linesCount: linesToDisplay.length,
          firstLine: linesToDisplay[0]?.text?.substring(0, 30),
          hasAuthorship: trackAuthorship && trackAuthorship.trim() ? true : false,
        });
      }

      // Устанавливаем данные только если запрос не был отменён
      if (!cancelled) {
        const noticeSources = collectAlbumEditFallbackSources([
          ...(storedText === null && contentResolved.isFallback ? [contentResolved] : []),
          ...(!storedAuthorship?.trim() && authorshipResolved.isFallback
            ? [authorshipResolved]
            : []),
          ...(usedJsonSyncFallback
            ? [{ isFallback: true as const, source: jsonSyncedResolved.source }]
            : []),
        ]);
        setEditLocaleFallbackNotice(buildTranslatedContentEditFallbackNotice(noticeSources, lang));

        setSyncedLines(linesToDisplay);
        setLastTextHash(textHash);
        setCurrentTrackId(currentTrackIdStr);
        setIsDirty(false);
        setIsSaved(false);
        initializedRef.current = currentTrackIdStr;
        setIsLoading(false); // Загрузка завершена
        loadingRef.current = false; // Сбрасываем флаг загрузки

        if (process.env.NODE_ENV === 'development') {
          console.log(
            '✅ Загрузка завершена, syncedLines установлен, linesCount:',
            linesToDisplay.length
          );
        }
      } else {
        loadingRef.current = false; // Сбрасываем флаг загрузки при отмене
      }
    })();

    // Cleanup функция для отмены запроса при размонтировании или изменении зависимостей
    return () => {
      cancelled = true;
      loadingRef.current = false; // Сбрасываем флаг загрузки при cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    albumsStatus,
    albumId,
    trackId,
    lang,
    // currentTrackId и lastTextHash убраны из зависимостей, чтобы избежать бесконечного цикла
    // album используется из замыкания, но не в зависимостях
  ]);

  // Установить тайм-код для конкретной строки
  const setLineTime = useCallback(
    (lineIndex: number, field: 'startTime' | 'endTime') => {
      if (isInteractionLocked) {
        return;
      }
      const time = field === 'startTime' ? currentTime.current : currentTime.current;

      setSyncedLines((prev) => {
        const newLines = [...prev];
        if (!newLines[lineIndex]) return prev;

        newLines[lineIndex] = {
          ...newLines[lineIndex],
          [field]: time,
        };

        // Если устанавливаем startTime, автоматически устанавливаем/обновляем endTime предыдущей строки
        if (field === 'startTime' && lineIndex > 0) {
          const prevLine = newLines[lineIndex - 1];
          // Всегда обновляем endTime предыдущей строки на новый startTime,
          // чтобы избежать перекрытий и обеспечить последовательность
          newLines[lineIndex - 1] = {
            ...prevLine,
            endTime: time,
          };
        }

        setIsDirty(true);
        return newLines;
      });
    },
    [currentTime, isInteractionLocked]
  );

  // Сбросить endTime для конкретной строки
  const clearEndTime = useCallback(
    (lineIndex: number) => {
      if (isInteractionLocked) {
        return;
      }
      setSyncedLines((prev) => {
        const newLines = [...prev];
        if (!newLines[lineIndex]) return prev;

        const { endTime, ...rest } = newLines[lineIndex];
        newLines[lineIndex] = rest;

        setIsDirty(true);
        return newLines;
      });
    },
    [isInteractionLocked]
  );

  // Сохранить синхронизации
  const handleSave = useCallback(async () => {
    if (syncedLines.length === 0) {
      alert('Нет строк для сохранения');
      return;
    }

    // Загружаем авторство для передачи в сохранение (но не редактируем его здесь)
    const storedAuthorship = await loadAuthorshipFromStorage(albumId, trackId, lang);

    // Получаем трек для получения авторства из JSON
    let trackAuthorship = '';
    if (album) {
      const track = album.tracks.find((t) => String(t.id) === trackId);
      if (track) {
        const fromStore = storedAuthorship?.trim() ? storedAuthorship : '';
        trackAuthorship = fromStore || resolveTrackFieldForEdit(track, 'authorship', lang).value;
      } else {
        trackAuthorship = storedAuthorship || '';
      }
    } else {
      trackAuthorship = storedAuthorship || '';
    }

    // Фильтруем строки авторства из syncedLines перед сохранением
    // (если у строки авторства нет таймкодов, она не должна сохраняться в syncedLyrics)
    const trackAuthorshipTrimmed = trackAuthorship.trim();
    const linesToSave = syncedLines.filter((line, index) => {
      // Если это последняя строка и она совпадает с authorship, проверяем наличие таймкодов
      // Используем trim() для корректного сравнения
      if (
        index === syncedLines.length - 1 &&
        trackAuthorshipTrimmed &&
        line.text.trim() === trackAuthorshipTrimmed
      ) {
        // Сохраняем authorship только если у него есть таймкоды
        return line.startTime > 0 || line.endTime !== undefined;
      }
      return true;
    });

    console.log('💾 Сохранение синхронизаций:', {
      albumId,
      trackId,
      lang,
      linesCount: linesToSave.length,
      syncedLines: linesToSave,
      authorship: trackAuthorship.trim() || undefined,
    });

    const result = await saveSyncedLyrics({
      albumId,
      trackId,
      lang,
      syncedLyrics: linesToSave,
      authorship: trackAuthorship.trim() || undefined,
    });

    console.log('💾 Результат сохранения:', result);

    if (result.success) {
      // После успешного сохранения перезагружаем синхронизации из БД
      // чтобы отобразить актуальные сохранённые данные
      const savedSync = await loadSyncedLyricsFromStorage(albumId, trackId, lang);
      if (savedSync && savedSync.length > 0) {
        // Используем сохраненные синхронизации как есть
        // Authorship уже там, если был сохранен с таймерами
        // НЕ добавляем authorship автоматически - он должен быть частью syncedLyrics
        setSyncedLines(savedSync);
      }

      // Обновляем хэш текста, чтобы предотвратить повторную инициализацию
      const [storedText, storedAuthorship] = await Promise.all([
        loadTrackTextFromDatabase(albumId, trackId, lang),
        loadAuthorshipFromStorage(albumId, trackId, lang),
      ]);
      const textToUse = storedText || '';
      const newHash = `${textToUse}-${storedAuthorship || ''}`;
      setLastTextHash(newHash);

      setIsDirty(false);
      setIsSaved(true);
      setIsInteractionLocked(true);
      // Обнуляем плеер: сбрасываем время на 0 и ставим на паузу
      dispatch(playerActions.pause());
      dispatch(playerActions.setCurrentTime(0));
      dispatch(playerActions.setProgress(0));
      dispatch(playerActions.setTime({ current: 0, duration: durationRef.current }));
      audioController.pause();
      audioController.setCurrentTime(0);
    } else {
      setIsSaved(false);
      alert(`❌ Ошибка сохранения: ${result.message || 'Неизвестная ошибка'}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, trackId, lang, syncedLines, dispatch]); // album убран из зависимостей, чтобы избежать бесконечного цикла

  // Ref для контейнера audio элемента
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  // Прикрепляем audio элемент к DOM при монтировании и при изменении контейнера
  useEffect(() => {
    console.log('🔧 useEffect: прикрепление аудио-элемента', {
      hasContainer: !!audioContainerRef.current,
      hasElement: !!audioController.element,
      elementInDOM: audioController.element.parentNode !== null,
    });

    if (audioContainerRef.current) {
      // Если элемент уже прикреплён к другому родителю, перемещаем его
      if (
        audioController.element.parentNode &&
        audioController.element.parentNode !== audioContainerRef.current
      ) {
        console.log('🔄 Перемещаем аудио-элемент из другого контейнера');
        audioController.element.parentNode.removeChild(audioController.element);
      }
      // Прикрепляем элемент, если он ещё не прикреплён
      if (!audioContainerRef.current.contains(audioController.element)) {
        audioContainerRef.current.appendChild(audioController.element);
        console.log('✅ Аудио-элемент прикреплён к DOM');
      } else {
        console.log('ℹ️ Аудио-элемент уже прикреплён');
      }
    } else {
      console.warn('⚠️ audioContainerRef.current не найден');
    }
  }, [trackId]); // album используется из замыкания, trackId достаточно для отслеживания смены трека

  // Обработчик окончания трека - ставим на паузу, чтобы не переключался на следующий
  useEffect(() => {
    const audioElement = audioController.element;

    const handleEnded = () => {
      // Ставим на паузу при окончании трека и блокируем взаимодействие
      dispatch(playerActions.pause());
      audioController.pause();
      setIsInteractionLocked(true);
    };

    audioElement.addEventListener('ended', handleEnded);

    return () => {
      audioElement.removeEventListener('ended', handleEnded);
    };
  }, [dispatch]);

  // Duration обновляется автоматически через глобальный обработчик loadedmetadata в playerListeners.ts
  // Не нужно дублировать логику здесь

  // Форматирование времени для отображения (MM:SS)
  const formatTimeCompact = useCallback((seconds: number) => {
    if (isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Ref для прямого доступа к контейнеру времени и прогресс-бару
  const timeContainerRef = useRef<HTMLDivElement | null>(null);
  const progressInputRef = useRef<HTMLInputElement | null>(null);
  const currentTimeRef = useRef<HTMLSpanElement | null>(null);
  const remainingTimeRef = useRef<HTMLSpanElement | null>(null);

  // Обновляем CSS переменную --progress-width для визуального отображения прогресса
  // Обновляем только если пользователь НЕ перематывает трек вручную (isSeeking = false)
  useEffect(() => {
    if (progressInputRef.current && !isSeeking) {
      progressInputRef.current.style.setProperty('--progress-width', `${progress}%`);
    }
  }, [progress, isSeeking]);

  // Используем useLayoutEffect для синхронного обновления времени
  // Обновляем два отдельных элемента через textContent напрямую
  // useLayoutEffect выполняется синхронно до следующего рендера
  useLayoutEffect(() => {
    if (currentTimeRef.current && remainingTimeRef.current) {
      // Вычисляем значения напрямую из time
      const currentValue = formatTimeCompact(time.current);
      const remainingValue = formatTimeCompact(time.duration - time.current);

      // Обновляем напрямую - useLayoutEffect уже синхронный
      currentTimeRef.current.textContent = currentValue;
      remainingTimeRef.current.textContent = remainingValue;
    }
  }, [time, formatTimeCompact]);

  // Форматирование времени для отображения (с миллисекундами для тайм-кодов)
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }, []);

  // Обработка изменения прогресс-бара (как в AudioPlayer)
  const handleProgressChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isInteractionLocked) {
        return;
      }
      const duration = time.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const value = Number(event.target.value);
      const newTime = (value / 100) * duration;

      dispatch(playerActions.setSeeking(true));
      // ЯВНО устанавливаем время в audio элементе сразу, не дожидаясь middleware
      // Это гарантирует, что аудио перематывается немедленно при клике на слайдер
      audioController.setCurrentTime(newTime);
      dispatch(playerActions.setCurrentTime(newTime));
      dispatch(playerActions.setTime({ current: newTime, duration }));
      dispatch(playerActions.setProgress(value));
      if (progressInputRef.current) {
        progressInputRef.current.style.setProperty('--progress-width', `${value}%`);
      }
    },
    [dispatch, time.duration, isInteractionLocked]
  );

  // Обработчик окончания перемотки (как в AudioPlayer)
  const handleSeekEnd = useCallback(async () => {
    if (isInteractionLocked) {
      return;
    }
    // Снимаем флаг isSeeking (разрешает автообновление прогресса)
    dispatch(playerActions.setSeeking(false));
    if (isPlaying) {
      dispatch(playerActions.play());
      try {
        await audioController.play();
      } catch (error) {
        console.error('Ошибка воспроизведения после перемотки:', error);
      }
    }
  }, [dispatch, isPlaying, isInteractionLocked]);

  // Переключение play/pause - просто как в AudioPlayer
  const togglePlayPause = useCallback(() => {
    if (isInteractionLocked && !isPlaying) {
      setIsInteractionLocked(false);
      dispatch(playerActions.setCurrentTime(0));
      dispatch(playerActions.setProgress(0));
      audioController.setCurrentTime(0);
    }
    dispatch(playerActions.toggle());
  }, [dispatch, isInteractionLocked, isPlaying]);

  // Данные загружаются через loader

  if (albumsStatus === 'loading' || albumsStatus === 'idle') {
    return (
      <section className="admin-sync main-background" aria-label="Синхронизация текста">
        <div className="wrapper">
          <Loader />
        </div>
      </section>
    );
  }

  if (albumsStatus === 'failed') {
    return (
      <section className="admin-sync main-background" aria-label="Синхронизация текста">
        <div className="wrapper">
          <ErrorMessage error={albumsError || 'Не удалось загрузить данные трека'} />
        </div>
      </section>
    );
  }

  if (!album) {
    return (
      <section className="admin-sync main-background" aria-label="Синхронизация текста">
        <div className="wrapper">
          <ErrorMessage error={`Альбом "${albumId}" не найден`} />
        </div>
      </section>
    );
  }

  const track = album.tracks.find((t) => String(t.id) === trackId);

  if (!track) {
    return (
      <section className="admin-sync main-background" aria-label="Синхронизация текста">
        <div className="wrapper">
          <ErrorMessage
            error={`Трек #${trackId} не найден в альбоме "${album.album}". Доступные треки: ${album.tracks.map((t) => `${t.id} - ${t.title}`).join(', ')}`}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="admin-sync main-background" aria-label="Синхронизация текста">
      <div className="wrapper">
        <div className="admin-sync__header">
          <h1>Синхронизация текста</h1>
          {editLocaleFallbackNotice ? (
            <p className="admin-sync__locale-fallback" role="status">
              {editLocaleFallbackNotice}
            </p>
          ) : null}
          <p className="admin-sync__description">
            Запустите трек и нажимайте кнопки с временем рядом со строками, когда они начинают
            звучать. Конец строки устанавливается автоматически при установке начала следующей. Если
            нужно создать паузу между строками (заглушка в виде троеточия), установите конец
            предыдущей строки раньше начала следующей или начните первую строку не с нуля. Не
            забудьте сохранить синхронизацию после завершения.
          </p>
        </div>

        {/* Компактный плеер для прослушивания трека */}
        <div className="admin-sync__player">
          <div className="admin-sync__player-container" ref={audioContainerRef}>
            {/* Audio элемент будет вставлен сюда автоматически */}
          </div>
          <div className="admin-sync__player-wrapper">
            <div className="admin-sync__player-cover">
              <AlbumCover
                img={album.cover || ''}
                fullName={formatAlbumDisplayFullName(siteArtistName, album.album)}
                size={448}
              />
            </div>
            <div className="admin-sync__player-info">
              <div className="admin-sync__player-title">
                {resolveTrackFieldForEdit(track, 'title', lang).value}
              </div>
              <div className="admin-sync__player-artist">{siteArtistUiLabel(siteArtistName)}</div>
            </div>
            <div className="admin-sync__player-controls">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  togglePlayPause();
                }}
                className="admin-sync__player-play-btn"
                aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
                style={{
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  zIndex: 1000,
                  position: 'relative',
                }}
              >
                {isPlaying ? (
                  <Pause {...playerTransportIconProps(16)} />
                ) : (
                  <Play {...playerTransportIconProps(16)} />
                )}
              </button>
            </div>
            <div className="admin-sync__player-progress-wrapper">
              <div className="admin-sync__player-progress-bar">
                <input
                  ref={progressInputRef}
                  type="range"
                  value={progress}
                  min="0"
                  max="100"
                  onChange={handleProgressChange}
                  onInput={handleProgressChange}
                  onMouseUp={handleSeekEnd}
                  onTouchEnd={handleSeekEnd}
                  disabled={isInteractionLocked}
                  aria-label="Прогресс воспроизведения"
                />
              </div>
              {/* Время: текущее и оставшееся */}
              {/* Используем два отдельных элемента для атомарного обновления через textContent */}
              <div className="admin-sync__player-time" ref={timeContainerRef}>
                <span ref={currentTimeRef}>{formatTimeCompact(time.current)}</span>
                <span ref={remainingTimeRef}>
                  {formatTimeCompact(time.duration - time.current)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Список строк с тайм-кодами */}
        <div className="admin-sync__lines">
          {isLoading || syncedLines.length === 0 ? (
            <div className="admin-sync__loading">
              <Loader />
            </div>
          ) : (
            <div className="admin-sync__lines-list">
              {syncedLines.map((line, index) => (
                <div key={index} className="admin-sync__line">
                  <div className="admin-sync__line-number">{index + 1}</div>
                  <div className="admin-sync__line-text">{line.text}</div>
                  <div className="admin-sync__line-times">
                    <button
                      type="button"
                      onClick={() => setLineTime(index, 'startTime')}
                      className="admin-sync__time-btn"
                      disabled={isInteractionLocked || (currentTime.current === 0 && !isPlaying)}
                    >
                      {formatTime(line.startTime)}
                    </button>
                    <div className="admin-sync__line-end">
                      <button
                        type="button"
                        onClick={() => setLineTime(index, 'endTime')}
                        className="admin-sync__time-btn"
                        disabled={isInteractionLocked || (currentTime.current === 0 && !isPlaying)}
                      >
                        {formatTime(line.endTime ?? 0)}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearEndTime(index)}
                        className="admin-sync__time-btn admin-sync__time-btn--clear"
                        title="Сбросить конец строки"
                        disabled={
                          isInteractionLocked || line.endTime === undefined || line.endTime === 0
                        }
                      >
                        <XIcon {...dashboardActionIconProps({ size: 16 })} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Кнопка сохранения вынесена за пределы блока строк */}
        {!isLoading && syncedLines.length > 0 && (
          <div className="admin-sync__controls">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              className="admin-sync__save-btn"
            >
              Сохранить синхронизации
            </button>
            {isSaved && (
              <span className="admin-sync__saved-indicator">Синхронизации сохранены</span>
            )}
            {isDirty && (
              <span className="admin-sync__dirty-indicator">Есть несохранённые изменения</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
