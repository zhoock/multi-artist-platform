// src/pages/UserDashboard/components/SyncLyricsModal.tsx
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
  type MouseEvent,
} from 'react';
import { Popup } from '@shared/ui/popup';
import { AlertModal } from '@shared/ui/alertModal';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { LyricsSyncRemovedToast } from '@shared/ui/lyricsSyncRemovedToast/LyricsSyncRemovedToast';
import { queueLyricsSyncRemovedToast } from '@shared/lib/lyricsSyncRemovedToast';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import type { SyncedLyricsLine } from '@/models';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import {
  buildSyncEditorLinesFromBundle,
  isTimedSync,
  resolveLyricsSyncState,
} from '@shared/lib/lyrics';
import {
  deleteTrackLyricsSyncApi,
  fetchTrackLyricsBundle,
  resolveTrackLyricsBundle,
  saveTrackLyricsSyncApi,
} from '@entities/lyrics';
import { getUserAudioUrl } from '@shared/api/albums';
import { Pause, Play, Trash2 } from 'lucide-react';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import {
  LYRICS_MODAL_TRANSPORT_ICON_SIZE,
  playerTransportIconProps,
} from '@shared/ui/icons/playerActionIcon';
import { DashboardLoadingState } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import './SyncLyricsModal.style.scss';

interface SyncLyricsModalProps {
  isOpen: boolean;
  albumId: string;
  trackId: string;
  trackTitle: string;
  trackSrc?: string;
  /** Владелец файла в Storage (users/{id}/audio/...) */
  mediaOwnerUserId?: string;
  /** Длительность из метаданных трека (сек), если audio.duration ещё NaN */
  trackDurationSeconds?: number;
  /** Текст из дашборда, если в БД ещё нет строки (новые треки, гонка после сохранения). */
  initialLyricsText?: string;
  authorship?: string; // fallback
  onClose: () => void;
  onSave?: (bundle: TrackLyricsBundle) => void;
  onSyncSaved?: () => void;
}

const isUsableMediaDuration = (d: number): boolean => Number.isFinite(d) && d > 0 && d !== Infinity;

function durationFromSeekable(media: HTMLMediaElement): number {
  try {
    const sb = media.seekable;
    if (sb && sb.length > 0) {
      const end = sb.end(sb.length - 1);
      if (isUsableMediaDuration(end)) return end;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function pickPlaybackDurationSeconds(
  audioDuration: number,
  trackFallback: number | undefined,
  media: HTMLMediaElement
): number {
  if (isUsableMediaDuration(audioDuration)) return audioDuration;
  const fromSeek = durationFromSeekable(media);
  if (fromSeek > 0) return fromSeek;
  if (trackFallback !== undefined && isUsableMediaDuration(trackFallback)) return trackFallback;
  return 0;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || !Number.isFinite(seconds)) return '0:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const formatTimeCompact = (seconds: number): string => {
  if (isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const normalize = (s: string) => (s || '').trim();

/** Только UI: последняя строка авторства, не входит в SyncedLyricsLine / БД */
type VirtualAuthorshipLine = { text: string; __isAuthorship: true };

type DisplayLine = SyncedLyricsLine | VirtualAuthorshipLine;

function isVirtualAuthorshipLine(line: DisplayLine): line is VirtualAuthorshipLine {
  return '__isAuthorship' in line && line.__isAuthorship === true;
}

export function SyncLyricsModal({
  isOpen,
  albumId,
  trackId,
  trackTitle,
  trackSrc,
  mediaOwnerUserId,
  trackDurationSeconds,
  initialLyricsText,
  authorship: propAuthorship,
  onClose,
  onSave,
  onSyncSaved,
}: SyncLyricsModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [syncedLines, setSyncedLines] = useState<SyncedLyricsLine[]>([]);
  const [trackAuthorship, setTrackAuthorship] = useState<string>('');
  /** null → trackLyricsSlice; set after GET / save / remove to match persisted DB state. */
  const [persistedSyncOverride, setPersistedSyncOverride] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemovingSync, setIsRemovingSync] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // race-protection
  const requestIdRef = useRef(0);

  // ключ текущего трека/языка
  const keyNow = `${albumId}::${trackId}::${lang}`;

  const lyricsBundleFallback = useMemo((): TrackLyricsBundle | null => {
    const content = normalize(initialLyricsText || '');
    if (!content) return null;
    return {
      albumId,
      trackId: String(trackId),
      lang,
      content,
      authorship: propAuthorship,
      syncedLines: null,
      state: resolveLyricsSyncState({ content, syncedLines: null }),
      syncedAt: null,
    };
  }, [albumId, trackId, lang, initialLyricsText, propAuthorship]);

  const reduxHasPersistedSync = useAppSelector(
    (state) =>
      resolveTrackLyricsBundle(state, albumId, trackId, lyricsBundleFallback).state === 'synced'
  );

  const hasPersistedSync = persistedSyncOverride ?? reduxHasPersistedSync;

  const hasEditorTimings = useMemo(() => isTimedSync(syncedLines), [syncedLines]);

  const canRemoveSync = hasPersistedSync || hasEditorTimings;

  const audioPlaybackUrl = useMemo(() => {
    if (!trackSrc?.trim()) return null;
    return getUserAudioUrl(trackSrc, undefined, mediaOwnerUserId);
  }, [trackSrc, mediaOwnerUserId]);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    variant?: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);
  const [removeSyncConfirmOpen, setRemoveSyncConfirmOpen] = useState(false);
  const [removedToastTrigger, setRemovedToastTrigger] = useState(0);

  /**
   * ✅ СИНХРОННЫЙ СБРОС ДО PAINT
   * Это устраняет “на один кадр показывается старый текст” и ситуации,
   * когда старые тайминги начинают совпадать с новым аудио.
   */
  useLayoutEffect(() => {
    if (!isOpen) {
      setRemoveSyncConfirmOpen(false);
      setRemovedToastTrigger(0);
      return;
    }

    // инвалидируем все pending async цепочки
    requestIdRef.current += 1;

    // мгновенно чистим UI
    setSyncedLines([]);
    setTrackAuthorship('');
    setPersistedSyncOverride(null);
    setIsLoading(true);
    setIsDirty(false);

    // важно: сброс таймера/длительности, чтобы ничего “старого” не синкалось
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    // стопаем текущее аудио (если было)
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }, [isOpen, keyNow]);

  // Audio init (trackSrc)
  useEffect(() => {
    // прибиваем прошлый audio объект полностью
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (!audioPlaybackUrl || !isOpen) return;

    const audio = new Audio(audioPlaybackUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setDuration((prev) => {
        const next = pickPlaybackDurationSeconds(audio.duration, trackDurationSeconds, audio);
        return next > 0 ? next : prev;
      });
    };
    const applyDuration = () => {
      setDuration(pickPlaybackDurationSeconds(audio.duration, trackDurationSeconds, audio));
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', applyDuration);
    audio.addEventListener('durationchange', applyDuration);
    audio.addEventListener('loadeddata', applyDuration);
    audio.addEventListener('progress', applyDuration);
    audio.addEventListener('ended', handleEnded);
    audio.preload = 'auto';
    applyDuration();

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', applyDuration);
      audio.removeEventListener('durationchange', applyDuration);
      audio.removeEventListener('loadeddata', applyDuration);
      audio.removeEventListener('progress', applyDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, [audioPlaybackUrl, isOpen, trackDurationSeconds]);

  // Data load on open / track change
  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1;
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const isRequestValid = () => currentRequestId === requestIdRef.current;

    const loadData = async () => {
      try {
        const bundle = await fetchTrackLyricsBundle(albumId, trackId, lang);
        if (!isRequestValid()) return;

        const { lines, authorship } = buildSyncEditorLinesFromBundle(bundle, initialLyricsText);
        const authorshipToUse = normalize(authorship || propAuthorship || '');

        setPersistedSyncOverride(bundle.state === 'synced');
        setTrackAuthorship(authorshipToUse);
        setSyncedLines(lines);
      } catch (error) {
        console.error('[SyncLyricsModal] Load error:', error);
        if (!isRequestValid()) return;
        setSyncedLines([]);
        setTrackAuthorship('');
        setPersistedSyncOverride(false);
      } finally {
        if (isRequestValid()) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      requestIdRef.current += 1;
    };
    // ❗ duration НЕ включаем в deps: иначе при загрузке метаданных будет повторная загрузка текста
  }, [isOpen, albumId, trackId, lang, propAuthorship, initialLyricsText]);

  const displayLines = useMemo((): DisplayLine[] => {
    const auth = trackAuthorship.trim();
    if (!auth) return syncedLines;
    return [...syncedLines, { text: trackAuthorship, __isAuthorship: true }];
  }, [syncedLines, trackAuthorship]);

  const authorshipTiming = useMemo(() => {
    if (!trackAuthorship.trim() || !syncedLines.length || !duration) return null;
    const last = syncedLines[syncedLines.length - 1];
    const lastEnd = last.endTime;
    const start =
      typeof lastEnd === 'number' && Number.isFinite(lastEnd) && lastEnd > 0 ? lastEnd : duration;
    return {
      start,
      end: duration,
    };
  }, [syncedLines, duration, trackAuthorship]);

  const activeLineIndex = useMemo((): number | 'authorship' | null => {
    if (!Number.isFinite(currentTime) || currentTime < 0) return null;

    const hasAuth = Boolean(trackAuthorship.trim());

    for (let i = 0; i < syncedLines.length; i++) {
      const l = syncedLines[i];
      const start = l.startTime ?? 0;
      const isLast = i === syncedLines.length - 1;
      const rawEnd = l.endTime;
      const finiteLyricEnd =
        typeof rawEnd === 'number' && Number.isFinite(rawEnd) && rawEnd > 0 ? rawEnd : null;

      if (isLast && hasAuth && authorshipTiming) {
        const handoff = finiteLyricEnd ?? authorshipTiming.start;
        if (currentTime >= start && currentTime < handoff) return i;
        continue;
      }

      const end = finiteLyricEnd ?? Infinity;
      if (currentTime >= start && currentTime <= end) return i;
    }

    if (
      authorshipTiming &&
      hasAuth &&
      currentTime >= authorshipTiming.start &&
      currentTime <= duration
    ) {
      return 'authorship';
    }
    return null;
  }, [currentTime, syncedLines, authorshipTiming, trackAuthorship, duration]);

  const setLineTime = useCallback(
    (lineIndex: number, field: 'startTime' | 'endTime') => {
      const time = currentTime;

      setSyncedLines((prev) => {
        const newLines = [...prev];
        if (!newLines[lineIndex]) return prev;

        const nextLine: SyncedLyricsLine = {
          ...newLines[lineIndex],
          [field]: time,
        };

        newLines[lineIndex] = nextLine;

        if (field === 'startTime' && lineIndex > 0) {
          const prevLine = newLines[lineIndex - 1];
          newLines[lineIndex - 1] = { ...prevLine, endTime: time };
        }

        setIsDirty(true);
        return newLines;
      });
    },
    [currentTime]
  );

  const clearLineTiming = useCallback((lineIndex: number) => {
    setSyncedLines((prev) => {
      const newLines = [...prev];
      const line = newLines[lineIndex];
      if (!line) return prev;

      // Remove all timing for this line; keep lyric text for the editor.
      newLines[lineIndex] = {
        text: line.text,
        startTime: 0,
        endTime: undefined,
      };

      setIsDirty(true);
      return newLines;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const authorshipToSave = normalize(trackAuthorship || propAuthorship || '');

    const cleanLines = syncedLines.filter((l) => {
      const t = normalize(l.text || '');
      if (!t.length) return false;
      if (authorshipToSave && normalize(l.text || '') === authorshipToSave) return false;
      return true;
    });

    if (cleanLines.length === 0 && !authorshipToSave) {
      setAlertModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Нет строк для сохранения',
        variant: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      // No timed lines left → delete sync row so bundle resolves to text-only / empty.
      const bundle = isTimedSync(cleanLines)
        ? await saveTrackLyricsSyncApi({
            albumId,
            trackId,
            lang,
            syncedLyrics: cleanLines,
            authorship: authorshipToSave || undefined,
          })
        : await deleteTrackLyricsSyncApi(albumId, trackId);

      const { lines, authorship } = buildSyncEditorLinesFromBundle(bundle, initialLyricsText);
      setSyncedLines(lines);
      setTrackAuthorship(normalize(authorship || authorshipToSave || propAuthorship || ''));
      setIsDirty(false);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      }

      onSave?.(bundle);
      onSyncSaved?.();
      onClose();
    } catch (error) {
      console.error('[SyncLyricsModal] Save error:', error);
      setAlertModal({
        isOpen: true,
        title: 'Ошибка',
        message: '❌ Ошибка сохранения синхронизаций',
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    albumId,
    trackId,
    lang,
    syncedLines,
    propAuthorship,
    onClose,
    onSave,
    onSyncSaved,
    trackAuthorship,
    initialLyricsText,
  ]);

  const clearAllLocalTimings = useCallback(() => {
    setSyncedLines((prev) =>
      prev.map((line) => ({
        text: line.text,
        startTime: 0,
        endTime: undefined,
      }))
    );
    setIsDirty(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, []);

  const executeRemoveSync = useCallback(async () => {
    setRemoveSyncConfirmOpen(false);
    setIsRemovingSync(true);
    try {
      const bundle = await deleteTrackLyricsSyncApi(albumId, trackId);
      const { lines, authorship } = buildSyncEditorLinesFromBundle(bundle, initialLyricsText);

      setSyncedLines(lines);
      setTrackAuthorship(normalize(authorship || propAuthorship || ''));
      setPersistedSyncOverride(false);
      setIsDirty(false);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      }

      onSave?.(bundle);
      queueLyricsSyncRemovedToast();
      setRemovedToastTrigger((value) => value + 1);
    } catch (error) {
      console.error('[SyncLyricsModal] Remove sync error:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          error instanceof Error
            ? error.message
            : (ui?.dashboard?.errorSavingText ?? 'Error saving text'),
        variant: 'error',
      });
    } finally {
      setIsRemovingSync(false);
    }
  }, [albumId, trackId, initialLyricsText, onSave, propAuthorship, ui?.dashboard]);

  const handleRemoveSyncClick = useCallback(() => {
    if (hasPersistedSync) {
      setRemoveSyncConfirmOpen(true);
      return;
    }
    clearAllLocalTimings();
  }, [hasPersistedSync, clearAllLocalTimings]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((error) => console.error('Ошибка воспроизведения:', error));
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleProgressClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const finalizeSyncLyricsClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const syncLyricsCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isSaving || isRemovingSync,
    hasUnsavedChanges: isDirty,
    closeDialog,
  });

  const { requestClose: requestSyncLyricsClose } = syncLyricsCloseGuard;

  const handleRequestClose = useCallback(() => {
    requestSyncLyricsClose();
  }, [requestSyncLyricsClose]);

  return (
    <>
      <Popup
        isActive={isOpen}
        onClose={finalizeSyncLyricsClose}
        onCancelRequest={handleRequestClose}
        requestCloseRef={popupRequestCloseRef}
        closeBlocked={isSaving || isRemovingSync || syncLyricsCloseGuard.discardDialogOpen}
      >
        <LyricsSyncRemovedToast triggerKey={removedToastTrigger} />
        <div className="sync-lyrics-modal">
          <div
            className={`sync-lyrics-modal__card${isSaving || isRemovingSync ? ' sync-lyrics-modal__card--saving' : ''}`}
            aria-busy={isSaving || isRemovingSync}
          >
            <div className="sync-lyrics-modal__header">
              <h2 className="sync-lyrics-modal__title">
                {ui?.dashboard?.syncLyricsTitle ?? 'Sync lyrics'}
              </h2>
              <button
                type="button"
                className="sync-lyrics-modal__close"
                onClick={handleRequestClose}
                disabled={isSaving || isRemovingSync}
                aria-label="Закрыть"
              >
                <ModalCloseIcon />
              </button>
            </div>

            <div className="sync-lyrics-modal__divider"></div>

            <div className="sync-lyrics-modal__player">
              <button
                type="button"
                onClick={togglePlayPause}
                className="sync-lyrics-modal__play-button"
                aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
                disabled={!audioPlaybackUrl}
              >
                {isPlaying ? (
                  <Pause {...playerTransportIconProps(LYRICS_MODAL_TRANSPORT_ICON_SIZE)} />
                ) : (
                  <Play
                    {...playerTransportIconProps(LYRICS_MODAL_TRANSPORT_ICON_SIZE, {
                      className: 'sync-lyrics-modal__play-icon',
                    })}
                  />
                )}
              </button>

              {/* tracks__duration не ломаем */}
              <div className="sync-lyrics-modal__time">{formatTimeCompact(currentTime)}</div>
              <div className="sync-lyrics-modal__progress-bar" onClick={handleProgressClick}>
                <div
                  className="sync-lyrics-modal__progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="sync-lyrics-modal__duration">{formatTimeCompact(duration)}</div>
            </div>

            <div className="sync-lyrics-modal__divider"></div>

            <div className="sync-lyrics-modal__content">
              {isLoading ? (
                <DashboardLoadingState className="sync-lyrics-modal__loading" />
              ) : displayLines.length === 0 ? (
                <div className="sync-lyrics-modal__empty">
                  {ui?.dashboard?.noLyrics ?? 'Нет текста для синхронизации'}
                </div>
              ) : (
                <div className="sync-lyrics-modal__table">
                  <div className="sync-lyrics-modal__table-header">
                    <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--number">
                      #
                    </div>
                    <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--lyrics">
                      Lyrics
                    </div>
                    <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--start">
                      Start
                    </div>
                    <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--end">
                      End
                    </div>
                    <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--clear"></div>
                  </div>

                  <div className="sync-lyrics-modal__table-body">
                    {displayLines.map((line, displayIndex) => {
                      const isAuthorship = isVirtualAuthorshipLine(line);
                      const lyricIndex = displayIndex;
                      const isActive = isAuthorship
                        ? activeLineIndex === 'authorship'
                        : activeLineIndex === lyricIndex;

                      return (
                        <div
                          key={isAuthorship ? 'authorship' : `lyric-${lyricIndex}-${line.text}`}
                          className={`sync-lyrics-modal__table-row${
                            isActive ? ' sync-lyrics-modal__table-row--active' : ''
                          }`}
                        >
                          <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--number">
                            {displayIndex + 1}
                          </div>

                          <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--lyrics">
                            {line.text}
                          </div>

                          <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--start">
                            {isAuthorship ? (
                              <span className="sync-lyrics-modal__time-disabled">
                                {formatTime(authorshipTiming?.start ?? 0)}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLineTime(lyricIndex, 'startTime')}
                                className="sync-lyrics-modal__time-btn"
                                disabled={currentTime === 0 && !isPlaying}
                              >
                                {formatTime(line.startTime)}
                              </button>
                            )}
                          </div>

                          <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--end">
                            {isAuthorship ? (
                              <span className="sync-lyrics-modal__time-disabled">
                                {formatTime(duration)}
                              </span>
                            ) : line.endTime !== undefined && line.endTime > 0 ? (
                              <button
                                type="button"
                                onClick={() => setLineTime(lyricIndex, 'endTime')}
                                className="sync-lyrics-modal__time-btn"
                                disabled={currentTime === 0 && !isPlaying}
                              >
                                {formatTime(line.endTime)}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLineTime(lyricIndex, 'endTime')}
                                className="sync-lyrics-modal__time-btn sync-lyrics-modal__time-btn--set"
                                disabled={currentTime === 0 && !isPlaying}
                              >
                                Set end
                              </button>
                            )}
                          </div>

                          <div className="sync-lyrics-modal__table-col sync-lyrics-modal__table-col--clear">
                            {!isAuthorship &&
                              ((line.startTime ?? 0) > 0 ||
                                (line.endTime !== undefined && line.endTime > 0)) && (
                                <button
                                  type="button"
                                  onClick={() => clearLineTiming(lyricIndex)}
                                  className="sync-lyrics-modal__clear-btn"
                                  title={ui?.dashboard?.clearLineTimings ?? 'Remove line timings'}
                                  aria-label={
                                    ui?.dashboard?.clearLineTimings ?? 'Remove line timings'
                                  }
                                >
                                  <Trash2 {...dashboardActionIconProps({ size: 16 })} />
                                </button>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {!isLoading && displayLines.length > 0 && (
              <>
                <div className="sync-lyrics-modal__divider"></div>
                <div className="sync-lyrics-modal__actions">
                  <button
                    type="button"
                    className="sync-lyrics-modal__button sync-lyrics-modal__button--danger"
                    onClick={handleRemoveSyncClick}
                    disabled={!canRemoveSync || isSaving || isRemovingSync}
                  >
                    {ui?.dashboard?.removeSyncLyrics ?? 'Remove synchronization'}
                  </button>

                  <button
                    type="button"
                    className="sync-lyrics-modal__button sync-lyrics-modal__button--cancel"
                    onClick={handleRequestClose}
                    disabled={isSaving || isRemovingSync}
                  >
                    {ui?.dashboard?.cancel ?? 'Cancel'}
                  </button>

                  <div className="sync-lyrics-modal__actions-right">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!isDirty || isSaving || isRemovingSync}
                      className={`sync-lyrics-modal__button sync-lyrics-modal__button--primary${
                        isSaving ? ' sync-lyrics-modal__button--primary-loading' : ''
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <span className="sync-lyrics-modal__button-spinner" aria-hidden />
                          {ui?.dashboard?.saving ?? 'Saving...'}
                        </>
                      ) : (
                        (ui?.dashboard?.save ?? 'Save')
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <InlineEditDiscardDialog
          open={syncLyricsCloseGuard.discardDialogOpen}
          labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
          titleId={syncLyricsCloseGuard.discardTitleDomId}
          onStay={syncLyricsCloseGuard.dismissDiscardDialog}
          onDiscard={syncLyricsCloseGuard.finalizeCloseWithoutSaving}
        />
      </Popup>

      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          title={alertModal.title}
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => setAlertModal(null)}
        />
      )}

      <ConfirmationModal
        isOpen={removeSyncConfirmOpen}
        title={ui?.dashboard?.removeSyncLyrics ?? 'Remove synchronization'}
        message={
          ui?.dashboard?.removeSyncLyricsConfirm ??
          'Remove synchronization? Lyrics text will be kept as plain text.'
        }
        irreversibleHint={null}
        confirmText={ui?.dashboard?.removeSyncLyrics ?? 'Remove synchronization'}
        cancelText={ui?.dashboard?.cancel ?? 'Cancel'}
        closeLabel={ui?.dashboard?.close ?? 'Close'}
        variant="danger"
        onConfirm={() => void executeRemoveSync()}
        onCancel={() => setRemoveSyncConfirmOpen(false)}
      />
    </>
  );
}
