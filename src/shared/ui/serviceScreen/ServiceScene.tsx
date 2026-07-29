import { useRef } from 'react';
import { useServiceScene, useServiceSceneEngine } from './scene';
import './ServiceScene.scss';

export function ServiceScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene = useServiceScene();

  useServiceSceneEngine(containerRef, scene);

  return <div ref={containerRef} className="service-scene" aria-hidden="true" />;
}
