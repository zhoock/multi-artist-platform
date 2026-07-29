import * as THREE from 'three';
import type { AppearanceProfile } from '../appearance/registry';
import type { MotionProfile } from '../motion/registry';
import type { ShapeDefinition } from '../shapes/types';
import type { ServiceRendererHandle } from '../types';
import { createSoftPointTexture, resolveAppearanceOpacity } from './appearanceUtils';
import {
  computeBreathScale,
  computeBreakZonePhase,
  computeHorizontalDrift,
  computeIntroStagger,
  computeStretchScale,
  DEFAULT_MATTER_CONFIG,
  easeInOutCubic,
  generateScatterOrigin,
  isInsideBreakZone,
  prefersReducedMotion,
  sampleCoherentField,
  type MatterConfig,
} from './matterBehavior';
import {
  type MatterQuality,
  resolveParticleCount,
  sampleContourToParticles,
} from './particleQuality';

export type MatterEngineOptions = {
  shape: ShapeDefinition;
  motion: MotionProfile;
  appearance: AppearanceProfile;
  quality?: MatterQuality;
  matter?: Partial<MatterConfig>;
};

/**
 * Matter — unified field behavior. Receives dumb shape data; never knows its origin.
 */
export class MatterEngine implements ServiceRendererHandle {
  private readonly config: MatterConfig;
  private readonly motion: MotionProfile;
  private readonly appearance: AppearanceProfile;
  private readonly targets: Float32Array;
  private readonly origins: Float32Array;
  private readonly introStagger: Float32Array;
  private readonly base: Float32Array;
  private readonly scratch: Float32Array;
  private positions: Float32Array;

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrame = 0;
  private running = false;
  private reducedMotion = false;
  private clockStart = 0;
  private introStart = 0;

  constructor({ shape, motion, appearance, quality = 'medium', matter }: MatterEngineOptions) {
    const particleCount = resolveParticleCount(quality);
    this.targets = sampleContourToParticles(shape.contour, particleCount);
    this.motion = motion;
    this.appearance = appearance;
    this.config = { ...DEFAULT_MATTER_CONFIG, ...matter, ...motion.matterOverrides };

    this.origins = generateScatterOrigin(particleCount);
    this.introStagger = computeIntroStagger(this.targets);
    this.base = new Float32Array(this.targets.length);
    this.scratch = new Float32Array(this.targets.length);
    this.positions = new Float32Array(this.targets.length);
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.reducedMotion = prefersReducedMotion();
    this.initDrawSurface();

    if (!this.renderer || !this.canvas) {
      return;
    }

    container.appendChild(this.canvas);

    if (this.reducedMotion) {
      this.positions.set(this.targets);
      this.base.set(this.targets);
      this.geometry!.attributes.position.needsUpdate = true;
      this.resize();
      this.renderer.render(this.scene!, this.camera!);
      return;
    }

    this.positions.set(this.origins);
    this.base.set(this.origins);
    this.geometry!.attributes.position.needsUpdate = true;
    this.introStart = performance.now();
    this.clockStart = this.introStart;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.start();
  }

  unmount(): void {
    this.running = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.geometry?.dispose();
    this.material?.dispose();
    this.material?.map?.dispose();
    this.renderer?.dispose();
    this.canvas?.remove();

    this.canvas = null;
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.geometry = null;
    this.material = null;
  }

  setSize(width: number, height: number): void {
    if (!this.renderer || !this.camera || width === 0 || height === 0) {
      return;
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private initDrawSurface(): void {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(this.appearance.fogColor, this.appearance.fogDensity);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 12);
    this.camera.position.z = 2.65;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const texture = new THREE.CanvasTexture(createSoftPointTexture());
    this.material = new THREE.PointsMaterial({
      map: texture,
      color: this.appearance.color,
      size: this.appearance.pointSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: this.appearance.baseOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.scene.add(new THREE.Points(this.geometry, this.material));

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'service-scene__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  private resize(): void {
    if (!this.container) {
      return;
    }

    this.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  private start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.tick();
  }

  private tick = (): void => {
    if (!this.running || !this.renderer || !this.scene || !this.camera) {
      return;
    }

    this.animationFrame = requestAnimationFrame(this.tick);
    this.update(performance.now());
    this.renderer.render(this.scene, this.camera);
  };

  private update(now: number): void {
    if (!this.geometry || !this.material) {
      return;
    }

    const elapsed = (now - this.clockStart) / 1000;
    const introElapsed = now - this.introStart;
    const introDone = introElapsed >= this.config.introMs;
    const count = this.targets.length / 3;

    const breathPeriod = this.config.breathPeriodS * this.motion.breathPeriodScale;
    const breath = computeBreathScale(elapsed, breathPeriod, this.config.breathAmplitude);
    const fieldPhase = elapsed * this.config.fieldSpeed * this.motion.fieldSpeedScale;
    const driftX = this.config.driftAmplitude
      ? computeHorizontalDrift(
          elapsed,
          this.config.driftPeriodS ?? breathPeriod,
          this.config.driftAmplitude
        )
      : 0;
    const stretch = this.config.stretchAmplitude
      ? computeStretchScale(elapsed, breathPeriod, this.config.stretchAmplitude)
      : 1;
    const breakPhase = this.config.breakZoneDispersion
      ? computeBreakZonePhase(elapsed, this.config.breakZoneCycleS ?? breathPeriod)
      : 0;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let x = this.targets[ix];
      let y = this.targets[ix + 1];
      let z = this.targets[ix + 2];

      if (!introDone) {
        const particleStart =
          this.introStagger[i] * (this.config.introMs - this.config.particleIntroMs);
        const particleT = Math.min(
          1,
          Math.max(0, (introElapsed - particleStart) / this.config.particleIntroMs)
        );
        const eased = easeInOutCubic(particleT);
        x = this.origins[ix] + (this.targets[ix] - this.origins[ix]) * eased;
        y = this.origins[ix + 1] + (this.targets[ix + 1] - this.origins[ix + 1]) * eased;
        z = this.origins[ix + 2] + (this.targets[ix + 2] - this.origins[ix + 2]) * eased;
      }

      this.base[ix] = x;
      this.base[ix + 1] = y;
      this.base[ix + 2] = z;

      let px = x * breath * stretch + driftX;
      let py = y * breath;
      let pz = z;

      if (
        this.config.breakZoneDispersion &&
        this.config.breakZoneWidth &&
        this.config.breakZoneHeight &&
        isInsideBreakZone(x, y, this.config.breakZoneWidth, this.config.breakZoneHeight)
      ) {
        const falloff = 1 - Math.abs(x) / this.config.breakZoneWidth;
        const spread = breakPhase * this.config.breakZoneDispersion * falloff;
        px += Math.sign(x || 1) * spread;
        py += spread * 0.35;
        pz += spread * 0.2;
      }

      const field = sampleCoherentField(px, py, fieldPhase, this.config.fieldAmplitude);

      this.scratch[ix] = px + field.dx;
      this.scratch[ix + 1] = py + field.dy;
      this.scratch[ix + 2] = pz + field.dz;
    }

    this.positions.set(this.scratch);
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = resolveAppearanceOpacity(this.appearance, elapsed, breathPeriod);
  }
}

export function createMatterEngine(options: MatterEngineOptions): ServiceRendererHandle {
  return new MatterEngine(options);
}
