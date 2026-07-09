// src/pages/UserDashboard/components/PreviewLyricsModal.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import type { SyncedLyricsLine } from '@models';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { getSyncedLineEndTime } from '@features/player/lib/syncedLyricsTiming';
import { getUserAudioUrl } from '@shared/api/albums';
import { Pause, Play } from 'lucide-react';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import {
  LYRICS_MODAL_TRANSPORT_ICON_SIZE,
  playerTransportIconProps,
} from '@shared/ui/icons/playerActionIcon';
import './PreviewLyricsModal.style.scss';

interface PreviewLyricsModalProps {
  isOpen: boolean;
  lyrics: TrackLyricsBundle;
  trackSrc?: string;
  /** Владелец файла в Storage (users/{id}/audio/...) */
  mediaOwnerUserId?: string;
  onClose: () => void;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function PreviewLyricsModal({
  isOpen,
  lyrics,
  trackSrc,
  mediaOwnerUserId,
  onClose,
}: PreviewLyricsModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const audioPlaybackUrl = useMemo(() => {
    if (!trackSrc?.trim()) return null;
    return getUserAudioUrl(trackSrc, undefined, mediaOwnerUserId);
  }, [trackSrc, mediaOwnerUserId]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const isSynced = lyrics.state === 'synced';
  const authorship = lyrics.authorship?.trim() ?? '';

  useEffect(() => {
    if (!audioPlaybackUrl) return;
    const audio = new Audio(audioPlaybackUrl);
    audioRef.current = audio;
    audio.preload = 'auto';

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleError = (e: Event) => {
      console.error('[PreviewLyricsModal] Audio error:', e);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioPlaybackUrl]);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);

  const lines: SyncedLyricsLine[] = useMemo(() => {
    if (isSynced && lyrics.syncedLines?.length) {
      return lyrics.syncedLines;
    }
    return lyrics.content
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((text) => ({ text, startTime: 0 }));
  }, [isSynced, lyrics.content, lyrics.syncedLines]);

  const linesWithAuthorship: SyncedLyricsLine[] = useMemo(() => {
    if (!authorship) return lines;
    const last = lines[lines.length - 1];
    const lastEnd = last?.endTime;
    const authStart =
      typeof lastEnd === 'number' && Number.isFinite(lastEnd) && lastEnd > 0
        ? lastEnd
        : duration || 0;
    return [...lines, { text: authorship, startTime: authStart }];
  }, [authorship, duration, lines]);

  const currentLineIndex = React.useMemo(() => {
    if (!isSynced || linesWithAuthorship.length === 0) {
      return null;
    }

    const timeValue = currentTime;
    const firstLineStart = linesWithAuthorship[0]?.startTime ?? 0;

    if (!isPlaying && timeValue <= firstLineStart + 0.05) {
      return null;
    }

    let activeIndex: number | null = null;

    if (linesWithAuthorship.length > 0 && timeValue < linesWithAuthorship[0].startTime) {
      activeIndex = null;
    } else {
      for (let i = 0; i < linesWithAuthorship.length; i++) {
        const line = linesWithAuthorship[i];
        const nextLine = linesWithAuthorship[i + 1];
        const lineEndTime = getSyncedLineEndTime(linesWithAuthorship, i);

        if (timeValue >= line.startTime && timeValue < lineEndTime) {
          activeIndex = i;
          break;
        }

        if (!nextLine) {
          if (timeValue >= line.startTime) {
            activeIndex = i;
            break;
          }
          break;
        }
      }
    }

    return activeIndex;
  }, [isSynced, currentTime, isPlaying, linesWithAuthorship]);

  useEffect(() => {
    if (currentLineIndex === null || !lyricsContainerRef.current) return;

    const lineElement = lineRefs.current.get(currentLineIndex);
    if (!lineElement) return;

    const container = lyricsContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();

    const containerTop = containerRect.top;
    const containerBottom = containerRect.bottom;
    const lineTop = lineRect.top;
    const lineBottom = lineRect.bottom;

    const padding = 30;
    const isVisible = lineTop >= containerTop + padding && lineBottom <= containerBottom - padding;

    if (!isVisible) {
      lineElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [currentLineIndex]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      audioRef.current.play().catch((error) => {
        console.error('[PreviewLyricsModal] Error playing audio:', error);
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <Popup isActive={isOpen} onClose={onClose}>
      <div className="preview-lyrics-modal">
        <div className="preview-lyrics-modal__card">
          <div className="preview-lyrics-modal__header">
            <h2 className="preview-lyrics-modal__title">
              {ui?.dashboard?.previewLyrics ?? 'Preview Lyrics'}
            </h2>
            <PopupCloseButton
              className="preview-lyrics-modal__close"
              aria-label={ui?.dashboard?.close ?? 'Close'}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </div>
          <div className="preview-lyrics-modal__divider"></div>
          <div className="preview-lyrics-modal__player">
            <button
              type="button"
              className="preview-lyrics-modal__play-button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              disabled={!audioPlaybackUrl}
            >
              {isPlaying ? (
                <Pause {...playerTransportIconProps(LYRICS_MODAL_TRANSPORT_ICON_SIZE)} />
              ) : (
                <Play
                  {...playerTransportIconProps(LYRICS_MODAL_TRANSPORT_ICON_SIZE, {
                    className: 'preview-lyrics-modal__play-icon',
                  })}
                />
              )}
            </button>
            <div className="preview-lyrics-modal__time">{formatTime(currentTime)}</div>
            <div
              className="preview-lyrics-modal__progress-bar"
              onClick={audioPlaybackUrl ? handleSeek : undefined}
              style={{ cursor: audioPlaybackUrl ? 'pointer' : 'default' }}
            >
              <div
                className="preview-lyrics-modal__progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="preview-lyrics-modal__duration">{formatTime(duration)}</div>
          </div>
          <div className="preview-lyrics-modal__divider"></div>
          <div className="preview-lyrics-modal__content">
            <div className="preview-lyrics-modal__lyrics" ref={lyricsContainerRef}>
              {linesWithAuthorship.map((line, index) => {
                const isActive = currentLineIndex === index;
                return (
                  <div
                    key={index}
                    ref={(el) => {
                      if (el) {
                        lineRefs.current.set(index, el);
                      } else {
                        lineRefs.current.delete(index);
                      }
                    }}
                    className={`preview-lyrics-modal__lyric-line ${isActive ? 'preview-lyrics-modal__lyric-line--active' : ''}`}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Popup>
  );
}
