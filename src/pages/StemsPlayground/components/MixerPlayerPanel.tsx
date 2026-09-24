// src/pages/StemsPlayground/components/MixerPlayerPanel.tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import clsx from 'clsx';
import { Waveform } from '@shared/ui/waveform';
import { StemEngine, StemEnginePlayError } from '@audio/stemsEngine';
import { getAuthHeader } from '@shared/lib/auth';
import {
  panelStateToSettings,
  type PanelStemState,
  type SavedMixSetting,
} from '@entities/savedMix';
import type { MixerTrack } from '../lib/types';
import { formatTrackDuration } from '../lib/formatTrackDuration';
import { MixerStemRow } from './MixerStemRow';
import {
  MIXER_TRANSPORT_PLAY_ICON_SIZE,
  MIXER_WAVE_PLAY_ICON_SIZE,
  playerTransportIconProps,
} from '@shared/ui/icons/playerActionIcon';

type StemMixState = PanelStemState;

export type MixerPlayerPanelLabels = {
  play: string;
  pause: string;
  solo: string;
  mute: string;
  stemsLoadError: string;
  retry: string;
  stemLoadFailed: string;
  playBlocked: string;
  partialStemsFailed: string;
};

export type MixerPlayerPanelHandle = {
  /** Текущая конфигурация микшера для сохранения. */
  getMixSettings: () => SavedMixSetting[];
  /** Применить сохранённые настройки к движку и UI (мгновенно). */
  applyMix: (settings: SavedMixSetting[]) => void;
};

type MixerPlayerPanelProps = {
  track: MixerTrack;
  labels: MixerPlayerPanelLabels;
  /** Настройки shared-микса, применяются один раз после загрузки стемов. */
  initialMix?: SavedMixSetting[];
  /** Лёгкий индикатор над waveform (например, «Shared Mix»). */
  sharedNote?: ReactNode;
};

type LoadStatus = 'loading' | 'ready' | 'error';

function resolvePlayFeedbackMessage(error: unknown, labels: MixerPlayerPanelLabels): string {
  if (error instanceof StemEnginePlayError) {
    if (error.code === 'AUDIO_CONTEXT_BLOCKED') {
      return labels.playBlocked;
    }
    return labels.stemsLoadError;
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return labels.playBlocked;
  }
  return labels.stemsLoadError;
}

/** Полноценный микшер трека: Play, Waveform, список стемов с громкостью и Solo/Mute. */
function MixerPlayerPanelInner(
  { track, labels, initialMix, sharedNote }: MixerPlayerPanelProps,
  ref: React.ForwardedRef<MixerPlayerPanelHandle>
) {
  const engineRef = useRef<StemEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [failedStemIds, setFailedStemIds] = useState<Set<string>>(() => new Set());
  const [playFeedback, setPlayFeedback] = useState('');
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [mix, setMix] = useState<Record<string, StemMixState>>({});

  const waveWrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const mixRef = useRef<Record<string, StemMixState>>({});
  const initialMixRef = useRef<SavedMixSetting[] | undefined>(initialMix);
  const initialMixAppliedRef = useRef(false);

  isPlayingRef.current = isPlaying;
  mixRef.current = mix;
  initialMixRef.current = initialMix;

  const loading = loadStatus === 'loading';
  const transportDisabled = loadStatus !== 'ready';

  /** Применяет настройки к движку и состоянию UI; недостающие стемы — дефолт. */
  const applyMix = useCallback(
    (settings: SavedMixSetting[]) => {
      const byId = new Map(settings.map((s) => [s.stemId, s]));
      const engine = engineRef.current;
      const next: Record<string, StemMixState> = {};
      for (const stem of track.stems) {
        const s = byId.get(stem.id);
        const state: StemMixState = {
          volume: s ? Math.max(0, Math.min(1, s.volume)) : 1,
          muted: s?.muted ?? false,
          soloed: s?.solo ?? false,
        };
        next[stem.id] = state;
        if (engine?.hasPlayableNodes()) {
          engine.setVolume(stem.id, state.volume);
          engine.setMuted(stem.id, state.muted);
          engine.setSolo(stem.id, state.soloed);
        }
      }
      setMix(next);
    },
    [track.stems]
  );

  useImperativeHandle(
    ref,
    () => ({
      getMixSettings: () => panelStateToSettings(mixRef.current),
      applyMix,
    }),
    [applyMix]
  );

  const validStems = useMemo(() => {
    const map: Record<string, string> = {};
    track.stems.forEach((stem) => {
      if (stem.url && stem.url.trim() !== '') {
        map[stem.id] = stem.url;
      }
    });
    return map;
  }, [track]);

  const retryLoad = useCallback(() => {
    setIsPlaying(false);
    setPlayFeedback('');
    setFailedStemIds(new Set());
    initialMixAppliedRef.current = false;
    setLoadGeneration((n) => n + 1);
  }, []);

  // Создаём движок при монтировании трека или Retry (компонент пересоздаётся по ключу track.id).
  useEffect(() => {
    setMix(
      Object.fromEntries(
        track.stems.map((stem) => [stem.id, { volume: 1, muted: false, soloed: false }])
      )
    );
    setIsPlaying(false);
    setPlayFeedback('');
    setFailedStemIds(new Set());
    initialMixAppliedRef.current = false;

    if (Object.keys(validStems).length === 0) {
      engineRef.current = null;
      setLoadStatus('error');
      setLoadProgress(0);
      return;
    }

    setLoadStatus('loading');
    setLoadProgress(0);

    const engine = new StemEngine(validStems, undefined, { headers: getAuthHeader() });
    engineRef.current = engine;

    let disposed = false;
    void (async () => {
      try {
        const result = await engine.loadAll((p) => {
          if (!disposed) setLoadProgress(p);
        });
        if (disposed) return;

        setFailedStemIds(new Set(result.failedStemIds));
        setLoadStatus('ready');

        const preset = initialMixRef.current;
        if (preset && preset.length > 0 && !initialMixAppliedRef.current) {
          applyMix(preset);
          initialMixAppliedRef.current = true;
        }
      } catch (error) {
        console.error('❌ [MixerPlayerPanel] Ошибка при загрузке стемов:', error);
        if (!disposed) {
          engineRef.current = null;
          engine.dispose();
          setLoadStatus('error');
          setFailedStemIds(new Set(Object.keys(validStems)));
        }
      }
    })();

    return () => {
      disposed = true;
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [track.id, validStems, track.stems, loadGeneration, applyMix]);

  // RAF-цикл прогресса воспроизведения.
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

  const togglePlay = async () => {
    const e = engineRef.current;
    if (!e || transportDisabled) return;
    if (!isPlaying) {
      try {
        await e.play();
        setIsPlaying(e.isPlaying);
        setPlayFeedback('');
      } catch (error) {
        setIsPlaying(false);
        setPlayFeedback(resolvePlayFeedbackMessage(error, labels));
      }
    } else {
      try {
        await e.pause();
      } catch (error) {
        console.warn('[MixerPlayerPanel] pause failed', error);
      }
      setIsPlaying(false);
    }
  };

  const setVolume = (stemId: string, volume: number) => {
    if (failedStemIds.has(stemId)) return;
    engineRef.current?.setVolume(stemId, volume);
    setMix((m) => ({ ...m, [stemId]: { ...m[stemId], volume } }));
  };

  const toggleMute = (stemId: string) => {
    if (failedStemIds.has(stemId)) return;
    setMix((m) => {
      const next = !m[stemId]?.muted;
      engineRef.current?.setMuted(stemId, next);
      return { ...m, [stemId]: { ...m[stemId], muted: next } };
    });
  };

  const toggleSolo = (stemId: string) => {
    if (failedStemIds.has(stemId)) return;
    setMix((m) => {
      const next = !m[stemId]?.soloed;
      engineRef.current?.setSolo(stemId, next);
      return { ...m, [stemId]: { ...m[stemId], soloed: next } };
    });
  };

  const seekToClientX = (clientX: number) => {
    const wrap = waveWrapRef.current;
    const e = engineRef.current;
    if (!wrap || !e || transportDisabled || !Number.isFinite(e.getDuration())) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const newTime = ratio * e.getDuration();
    void e.seek(newTime).catch((error) => {
      console.warn('[MixerPlayerPanel] seek failed', error);
    });
    setTime((t) => ({ ...t, current: newTime }));
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    if (transportDisabled) return;
    draggingRef.current = true;
    wasPlayingRef.current = isPlayingRef.current;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    seekToClientX(evt.clientX);
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    if (!draggingRef.current || transportDisabled) return;
    seekToClientX(evt.clientX);
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (evt) => {
    draggingRef.current = false;
    evt.currentTarget.releasePointerCapture(evt.pointerId);
  };

  const showPartialWarning = loadStatus === 'ready' && failedStemIds.size > 0;

  return (
    <div className="mixer-player">
      {sharedNote ? <div className="mixer-player__shared-note">{sharedNote}</div> : null}

      {loadStatus === 'error' ? (
        <div className="mixer-player__load-error" role="alert">
          <p className="mixer-player__load-error-text">{labels.stemsLoadError}</p>
          <button type="button" className="btn" onClick={retryLoad}>
            {labels.retry}
          </button>
        </div>
      ) : null}

      {showPartialWarning ? (
        <p className="mixer-player__partial-warning" role="status">
          {labels.partialStemsFailed}
        </p>
      ) : null}

      {playFeedback ? (
        <p className="mixer-player__play-feedback" role="alert">
          {playFeedback}
        </p>
      ) : null}

      <div className="mixer-player__transport">
        <button
          className="btn"
          onClick={() => void togglePlay()}
          type="button"
          disabled={transportDisabled}
          aria-pressed={isPlaying}
        >
          <span className="mixer-player__transport-icon" aria-hidden>
            {isPlaying ? (
              <Pause {...playerTransportIconProps(MIXER_TRANSPORT_PLAY_ICON_SIZE)} />
            ) : (
              <Play
                {...playerTransportIconProps(MIXER_TRANSPORT_PLAY_ICON_SIZE, {
                  className: 'mixer-player__transport-icon--play',
                })}
              />
            )}
          </span>
          {isPlaying ? labels.pause : labels.play}
        </button>
      </div>

      <div className="mixer-player__waveform">
        <div className={clsx('stems__wave-wrap', { 'is-loading': loading })}>
          <button
            className="mixer-player__wave-play"
            onClick={() => void togglePlay()}
            type="button"
            disabled={transportDisabled}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? labels.pause : labels.play}
          >
            <span className="mixer-player__wave-play-icon" aria-hidden>
              {isPlaying ? (
                <Pause {...playerTransportIconProps(MIXER_WAVE_PLAY_ICON_SIZE)} />
              ) : (
                <Play
                  {...playerTransportIconProps(MIXER_WAVE_PLAY_ICON_SIZE, {
                    className: 'mixer-player__wave-play-icon--play',
                  })}
                />
              )}
            </span>
          </button>

          <div
            ref={waveWrapRef}
            className="stems__wave-track"
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
            ) : loadStatus === 'error' ? (
              <div className="stems__wave-placeholder" aria-hidden />
            ) : (
              <>
                <Waveform waveformUrl={track.waveformUrl} progress={progress} height={64} />
                <div className="stems__wave-cursor" style={{ left: `${progress * 100}%` }} />
              </>
            )}
          </div>
        </div>

        <div className="mixer-player__time">
          <time dateTime={`PT${Math.floor(time.current)}S`}>
            {formatTrackDuration(time.current)}
          </time>
          <time dateTime={`PT${Math.floor(time.duration)}S`}>
            {formatTrackDuration(time.duration)}
          </time>
        </div>
      </div>

      <div className="mixer-stem-list">
        {track.stems.map((stem) => {
          const state = mix[stem.id] ?? { volume: 1, muted: false, soloed: false };
          const stemFailed = failedStemIds.has(stem.id);
          return (
            <MixerStemRow
              key={stem.id}
              name={stem.name}
              category={stem.category}
              volume={state.volume}
              muted={state.muted}
              soloed={state.soloed}
              disabled={loading || stemFailed}
              loadFailed={stemFailed}
              loadFailedLabel={labels.stemLoadFailed}
              soloLabel={labels.solo}
              muteLabel={labels.mute}
              onVolumeChange={(v) => setVolume(stem.id, v)}
              onToggleMute={() => toggleMute(stem.id)}
              onToggleSolo={() => toggleSolo(stem.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

export const MixerPlayerPanel = forwardRef<MixerPlayerPanelHandle, MixerPlayerPanelProps>(
  MixerPlayerPanelInner
);
