import * as THREE from 'three';
import { prefersReducedMotion } from '../../../matter/matterBehavior';
import { createSoftPointTexture } from '../../../matter/appearanceUtils';
import type { ServiceRendererHandle } from '../../../types';
import { createBackgroundStarsLayer } from './layers/BackgroundStars';
import { createConstellationLinksLayer } from './layers/ConstellationLinks';
import { createConstellationNodesLayer } from './layers/ConstellationNodes';
import { computeConstellationCycle } from './constellationCycle';

/**
 * Broken-link constellation renderer — starfield + nodes + links + break.
 * Independent from Shape / Matter (blob placeholder not mounted here).
 */
export function createBrokenLinkConstellationRenderer(): ServiceRendererHandle {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let container: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame = 0;
  let running = false;
  let clockStart = 0;
  let reducedMotion = false;

  let backgroundStars: ReturnType<typeof createBackgroundStarsLayer> | null = null;
  let constellationNodes: ReturnType<typeof createConstellationNodesLayer> | null = null;
  let constellationLinks: ReturnType<typeof createConstellationLinksLayer> | null = null;
  const resolution = new THREE.Vector2(1, 1);

  function initDrawSurface(): void {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x050508, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 12);
    camera.position.z = 2.65;

    const starTexture = new THREE.CanvasTexture(createSoftPointTexture(64));
    const glowTexture = new THREE.CanvasTexture(createSoftPointTexture(96));
    const dustTexture = new THREE.CanvasTexture(createSoftPointTexture(48));

    backgroundStars = createBackgroundStarsLayer(starTexture);
    constellationNodes = createConstellationNodesLayer(glowTexture);
    constellationLinks = createConstellationLinksLayer(dustTexture, resolution);

    scene.add(backgroundStars.points);
    scene.add(constellationLinks.group);
    scene.add(constellationNodes.group);

    canvas = renderer.domElement;
    canvas.className = 'service-scene__canvas';
    canvas.setAttribute('aria-hidden', 'true');
  }

  function resize(): void {
    if (!container || !renderer || !camera) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) {
      return;
    }

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    resolution.set(width, height);
    constellationLinks?.setResolution(width, height);
  }

  function update(now: number): void {
    if (!backgroundStars || !constellationNodes || !constellationLinks) {
      return;
    }

    const elapsed = (now - clockStart) / 1000;
    const cycle = computeConstellationCycle(elapsed);
    backgroundStars.update(elapsed);
    constellationNodes.update(elapsed, cycle);
    constellationLinks.update(elapsed, cycle);
  }

  const tick = (): void => {
    if (!running || !renderer || !scene || !camera) {
      return;
    }

    animationFrame = requestAnimationFrame(tick);
    update(performance.now());
    renderer.render(scene, camera);
  };

  return {
    mount(target: HTMLElement) {
      container = target;
      reducedMotion = prefersReducedMotion();
      initDrawSurface();

      if (!renderer || !canvas) {
        return;
      }

      container.appendChild(canvas);
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);
      resize();

      if (reducedMotion) {
        update(performance.now());
        renderer.render(scene!, camera!);
        return;
      }

      clockStart = performance.now();
      running = true;
      tick();
    },

    unmount() {
      running = false;

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      resizeObserver?.disconnect();
      resizeObserver = null;

      backgroundStars?.dispose();
      constellationNodes?.dispose();
      constellationLinks?.dispose();

      backgroundStars = null;
      constellationNodes = null;
      constellationLinks = null;

      renderer?.dispose();
      canvas?.remove();

      canvas = null;
      container = null;
      scene = null;
      camera = null;
      renderer = null;
    },

    setSize(width: number, height: number) {
      if (!renderer || !camera || width === 0 || height === 0) {
        return;
      }

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      resolution.set(width, height);
      constellationLinks?.setResolution(width, height);
    },
  };
}
