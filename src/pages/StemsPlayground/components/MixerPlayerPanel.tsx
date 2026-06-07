// src/pages/StemsPlayground/components/MixerPlayerPanel.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Waveform } from '@shared/ui/waveform';
import { StemEngine } from '@audio/stemsEngine';
import type { MixerTrack } from '../lib/types';
import { MixerStemRow } from './MixerStemRow';

type StemMixState = {
  volume: number;
  muted: boolean;
  soloed: boolean;
};

type MixerPlayerPanelLabels = {
  play: string;
  pause: string;
  solo: string;
  mute: string;
};

type MixerPlayerPanelProps = {
  track: MixerTrack;
  labels: MixerPlayerPanelLabels;
};

/** Полноценный микшер трека: Play, Waveform, список стемов с громкостью и Solo/Mute. */
export function MixerPlayerPanel({ track, labels }: MixerPlayerPanelProps) {
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

  isPlayingRef.current = isPlaying;

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
        if (!disposed) setLoading(false);
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
      <div className="mixer-player__transport">
        <button
          className="btn"
          onClick={togglePlay}
          type="button"
          disabled={loading}
          aria-pressed={isPlaying}
        >
          <span className={clsx(isPlaying ? 'icon-controller-pause' : 'icon-controller-play')} />
          {isPlaying ? labels.pause : labels.play}
        </button>
      </div>

      <div
        ref={waveWrapRef}
        className={clsx('stems__wave-wrap', { 'is-loading': loading })}
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
