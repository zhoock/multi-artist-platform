import { useLayoutEffect, useState } from 'react';
import './style.scss';
import { PlayerHeaderSkeleton } from './PlayerHeaderSkeleton';
import { FullScreenPlayerTransportSkeleton } from './FullScreenPlayerTransportSkeleton';

function useShowVolumeControlSkeleton(): boolean {
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => {
      setShowVolumeControl(query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
    };
  }, []);

  return showVolumeControl;
}

/** Полноэкранная оболочка плеера до lazy-load чанка AudioPlayer (Suspense). */
export function FullScreenPlayerSkeleton() {
  const showVolumeControl = useShowVolumeControlSkeleton();
  const playerClassName = [
    'player',
    'player--header-loading',
    'player--skeleton-shell',
    showVolumeControl ? '' : 'player--no-volume',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={playerClassName} aria-busy="true">
      <PlayerHeaderSkeleton idPrefix="fullscreen-player" />
      <FullScreenPlayerTransportSkeleton showVolumeControl={showVolumeControl} />
    </div>
  );
}
