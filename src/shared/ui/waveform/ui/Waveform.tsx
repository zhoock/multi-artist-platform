import { useEffect, useRef, useState } from 'react';
import { loadWaveformPeaks } from '@shared/lib/audio/loadWaveformPeaks';
import './Waveform.scss';

type Props = {
  /** Server-generated waveform peaks JSON URL (C2/C3). */
  waveformUrl?: string | null;
  /** Progress 0..1 (from playback engine). */
  progress?: number;
  height?: number;
};

type WaveformLoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export default function Waveform({ waveformUrl, progress = 0, height = 56 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);
  const [loadState, setLoadState] = useState<WaveformLoadState>('idle');

  useEffect(() => {
    const url = waveformUrl?.trim();
    if (!url) {
      peaksRef.current = null;
      setLoadState('unavailable');
      return;
    }

    let aborted = false;
    peaksRef.current = null;
    setLoadState('loading');

    loadWaveformPeaks(url)
      .then((peaks) => {
        if (aborted) return;
        if (!peaks || peaks.length === 0) {
          peaksRef.current = null;
          setLoadState('unavailable');
          return;
        }
        peaksRef.current = peaks;
        setLoadState('ready');
        draw(progress);
      })
      .catch(() => {
        if (aborted) return;
        peaksRef.current = null;
        setLoadState('unavailable');
      });

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformUrl]);

  useEffect(() => {
    const onResize = () => draw(progress);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  useEffect(() => {
    draw(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, loadState]);

  const readColors = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const bg = cs.getPropertyValue('--wave-bars').trim() || 'rgb(255 255 255 / 35%)';
    const act = cs.getPropertyValue('--wave-bars-active').trim() || 'rgb(255 255 255 / 82%)';
    return { bg, act };
  };

  const draw = (p: number) => {
    const cvs = canvasRef.current;
    const peaks = peaksRef.current;
    if (!cvs || !peaks) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, cvs.clientWidth * dpr);
    const h = Math.max(1, cvs.clientHeight * dpr);
    cvs.width = w;
    cvs.height = h;

    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const { bg, act } = readColors(cvs);

    const mid = h / 2;
    const barW = w / peaks.length;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * (h * 0.9) * 0.5;
      ctx.fillRect(i * barW, mid - amp, Math.max(1, barW * 0.9), amp * 2);
    }

    const cutoff = Math.floor(peaks.length * Math.min(1, Math.max(0, p)));
    ctx.fillStyle = act;
    for (let i = 0; i < cutoff; i++) {
      const amp = peaks[i] * (h * 0.9) * 0.5;
      ctx.fillRect(i * barW, mid - amp, Math.max(1, barW * 0.9), amp * 2);
    }
  };

  if (loadState !== 'ready') {
    return (
      <div className="waveform" style={{ width: '100%' }}>
        <div
          className="waveform__skeleton"
          style={{ height }}
          role="img"
          aria-label="Waveform loading"
        />
      </div>
    );
  }

  return (
    <div className="waveform" style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height }} />
    </div>
  );
}
