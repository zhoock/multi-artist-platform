import { isHeroCanvasPerfEnabled, markHeroCanvasInit } from './heroCanvasInitDiagnostics';

export type HeroCanvasLifecycleSnapshot = {
  headerImagesCount: number;
  isHeaderImagesReady: boolean;
  showHeroCoverImage: boolean;
  universeMountedFor: string | null;
  catalogStatus?: string;
};

export function logHeroCanvasLifecycle(phase: string, snapshot: HeroCanvasLifecycleSnapshot): void {
  if (!isHeroCanvasPerfEnabled()) return;
  markHeroCanvasInit(phase);

  console.debug('[hero-canvas-lifecycle]', phase, {
    t: Math.round(performance.now()),
    ...snapshot,
  });
}
