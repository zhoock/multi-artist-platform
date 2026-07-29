import { useEffect, useRef } from 'react';
import type { ServiceSceneId } from '../types';
import { ServiceSceneEngine } from './ServiceSceneEngine';

export function useServiceSceneEngine(
  containerRef: React.RefObject<HTMLElement | null>,
  scene: ServiceSceneId | undefined
): void {
  const engineRef = useRef<ServiceSceneEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const engine = new ServiceSceneEngine();
    engine.attach(container);
    engineRef.current = engine;

    return () => {
      engine.detach();
      engineRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    engineRef.current?.setScene(scene);
  }, [scene]);
}
