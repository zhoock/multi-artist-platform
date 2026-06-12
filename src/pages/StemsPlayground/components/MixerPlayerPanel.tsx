// src/pages/StemsPlayground/components/MixerPlayerPanel.tsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import clsx from 'clsx';
import { Waveform } from '@shared/ui/waveform';
import { StemEngine } from '@audio/stemsEngine';
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
  playerIconProps,
} from '@shared/ui/icons/playerActionIcon';

type StemMixState = PanelStemState;

type MixerPlayerPanelLabels = {
  play: string;
  pause: string;
  solo: string;
  mute: string;
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

/** Полноценный микшер трека: Play, Waveform, список стемов с громкостью и Solo/Mute. */
function MixerPlayerPanelInner(
  { track, labels, initialMix, sharedNote }: MixerPlayerPanelProps,
  ref: React.ForwardedRef<MixerPlayerPanelHandle>
) {
  const engineRef = useRef<StemEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [mix, setMix] = useState<Record<string, StemMixState>>({});

  const waveWrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const mixRef = useRef<Record<string, StemMixState>>({});
  const initialMixRef = useRef<SavedMixSetting[] | undefined>(initialMix);

  isPlayingRef.current = isPlaying;
  mixRef.current = mix;
  initialMixRef.current = initialMix;

  /** Применяет настройки к движку и состоянию UI; недостающие стемы — дефолт. */
  const applyMix = (settings: SavedMixSetting[]) => {
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
      engine?.setVolume(stem.id, state.volume);
      engine?.setMuted(stem.id, state.muted);
      engine?.setSolo(stem.id, state.soloed);
    }
    setMix(next);
  };

  useImperativeHandle(
    ref,
    () => ({
      getMixSettings: () => panelStateToSettings(mixRef.current),
      applyMix,
    }),
    // applyMix замыкает актуальный track через ref-стейт движка; пересоздаём при смене трека.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track.id]
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

  // Создаём движок при монтировании трека (компонент пересоздаётся по ключу track.id).
  useEffect(() => {
    setMix(
      Object.fromEntries(
        track.stems.map((stem) => [stem.id, { volume: 1, muted: false, soloed: false }])
      )
    );

    if (Object.keys(validStems).length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadProgress(0);
    setIsPlaying(false);

    const engine = new StemEngine(validStems);
    engineRef.current = engine;

    let disposed = false;
    (async () => {
      try {
        await engine.loadAll((p) => setLoadProgress(p));
        if (disposed) return;
        // Shared-микс: применяем сохранённые настройки один раз после загрузки.
        const preset = initialMixRef.current;
        if (preset && preset.length > 0) {
          applyMix(preset);
        }
        setLoading(false);
      } catch (error) {
        console.error('❌ [MixerPlayerPanel] Ошибка при загрузке стемов:', error);
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      engine.dispose();
      engineRef.current = null;
    };
    // applyMix стабилен в рамках монтирования трека (компонент пересоздаётся по key={track.id}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, validStems, track.stems]);

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
  const waveformSrc = track.mixUrl ?? track.stems[0]?.url;

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

  const setVolume = (stemId: string, volume: number) => {
    engineRef.current?.setVolume(stemId, volume);
    setMix((m) => ({ ...m, [stemId]: { ...m[stemId], volume } }));
  };

  const toggleMute = (stemId: string) => {
    setMix((m) => {
      const next = !m[stemId]?.muted;
      engineRef.current?.setMuted(stemId, next);
      return { ...m, [stemId]: { ...m[stemId], muted: next } };
    });
  };

  const toggleSolo = (stemId: string) => {
    setMix((m) => {
      const next = !m[stemId]?.soloed;
      engineRef.current?.setSolo(stemId, next);
      return { ...m, [stemId]: { ...m[stemId], soloed: next } };
    });
  };

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
    wasPlayingRef.current = isPlayingRef.current;
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
  };

  return (
    <div className="mixer-player">
      {sharedNote ? <div className="mixer-player__shared-note">{sharedNote}</div> : null}
      <div className="mixer-player__transport">
        <button
          className="btn"
          onClick={togglePlay}
          type="button"
          disabled={loading}
          aria-pressed={isPlaying}
        >
          <span className="mixer-player__transport-icon" aria-hidden>
            {isPlaying ? (
              <Pause {...playerIconProps(MIXER_TRANSPORT_PLAY_ICON_SIZE)} />
            ) : (
              <Play
                {...playerIconProps(MIXER_TRANSPORT_PLAY_ICON_SIZE, {
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
            onClick={togglePlay}
            type="button"
            disabled={loading}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? labels.pause : labels.play}
          >
            <span className="mixer-player__wave-play-icon" aria-hidden>
              {isPlaying ? (
                <Pause {...playerIconProps(MIXER_WAVE_PLAY_ICON_SIZE)} />
              ) : (
                <Play
                  {...playerIconProps(MIXER_WAVE_PLAY_ICON_SIZE, {
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
            ) : (
              <>
                <Waveform src={waveformSrc} progress={progress} height={64} />
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
          return (
            <MixerStemRow
              key={stem.id}
              name={stem.name}
              category={stem.category}
              volume={state.volume}
              muted={state.muted}
              soloed={state.soloed}
              disabled={loading}
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
