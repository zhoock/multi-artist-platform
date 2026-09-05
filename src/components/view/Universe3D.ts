import * as THREE from 'three';
import type { ProfileNameUpdatedDetail } from '@shared/lib/profileDisplayName';
import { isUniverseSceneOverlayTarget } from '@shared/lib/universeSceneOverlay';
import './Universe3D.style.scss';
import { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY } from './universe3dConstants';
import type { SceneArtist } from './universe3dTypes';

export { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY } from './universe3dConstants';
export type { SceneArtist } from './universe3dTypes';

/** Manhattan distance (px) before touch pan counts as drag, not tap. */
const TOUCH_MOVE_THRESHOLD_PX = 5;

/** Max XY offset vs clusterSize; disk for labels = this × CLOUD_ARTIST_DISK_FR (must match buildClusters). */
const CLOUD_INNER_RADIUS_FACTOR = 0.78;
/** Random disk stays inside fog, not on outer rim (fraction of inner radius). */
const CLOUD_ARTIST_DISK_FR = 0.62;
/** Depth spread vs spreadZ base (stay inside volume). */
const CLOUD_ARTIST_Z_FR = 0.68;

/** Target spacing ≈ (volume / n)^(1/3); lower = tighter packing. */
const CLOUD_LABEL_PACK_FR = 0.52;
/** Clamp min separation to [floor, cap] × clusterSize (world units). */
const CLOUD_LABEL_MIN_SEP_FLOOR_FR = 0.052;
const CLOUD_LABEL_MIN_SEP_CAP_FR = 0.22;
/** Multiply minDist when a full pass fails to place all points. */
const CLOUD_LABEL_MIN_RELAX = 0.9;
const CLOUD_LABEL_MAX_PLACE_ROUNDS = 120;
const CLOUD_LABEL_MAX_ATTEMPTS_PER_POINT = 8000;

function sampleUniformInCloudCylinder(
  diskRadius: number,
  spreadZHalf: number,
  target: THREE.Vector3
): void {
  const theta = Math.random() * Math.PI * 2;
  const r = diskRadius * Math.sqrt(Math.random());
  const z = (Math.random() * 2 - 1) * spreadZHalf;
  target.set(Math.cos(theta) * r, Math.sin(theta) * r, z);
}

function tryPlaceCloudLabels(
  count: number,
  diskRadius: number,
  spreadZHalf: number,
  minDist: number,
  maxAttemptsPerPoint: number
): THREE.Vector3[] | null {
  if (count <= 0) {
    return [];
  }

  const positions: THREE.Vector3[] = [];
  const cellMap = new Map<string, number[]>();
  const minDistSq = minDist * minDist;
  const scratch = new THREE.Vector3();

  const cellKey = (x: number, y: number, z: number) =>
    `${Math.floor(x / minDist)},${Math.floor(y / minDist)},${Math.floor(z / minDist)}`;

  const tooCloseToExisting = (p: THREE.Vector3): boolean => {
    const ix = Math.floor(p.x / minDist);
    const iy = Math.floor(p.y / minDist);
    const iz = Math.floor(p.z / minDist);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = cellMap.get(cellKey(ix + dx, iy + dy, iz + dz));
          if (!bucket) {
            continue;
          }
          for (const j of bucket) {
            if (positions[j].distanceToSquared(p) < minDistSq - 1e-10) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttemptsPerPoint; attempt++) {
      sampleUniformInCloudCylinder(diskRadius, spreadZHalf, scratch);
      if (!tooCloseToExisting(scratch)) {
        const idx = positions.length;
        positions.push(new THREE.Vector3().copy(scratch));
        const key = cellKey(scratch.x, scratch.y, scratch.z);
        let list = cellMap.get(key);
        if (!list) {
          list = [];
          cellMap.set(key, list);
        }
        list.push(idx);
        placed = true;
        break;
      }
    }
    if (!placed) {
      return null;
    }
  }

  return positions;
}

/**
 * Uniform samples in a cylinder (disk × z) with minimum 3D separation; relaxes spacing until all fit.
 */
function sampleCloudLabelPositionsWithMinSep(
  count: number,
  diskRadius: number,
  spreadZHalf: number,
  clusterSize: number
): THREE.Vector3[] {
  if (count <= 0) {
    return [];
  }

  const cylVolume = Math.PI * diskRadius * diskRadius * (2 * spreadZHalf);
  let minDist = CLOUD_LABEL_PACK_FR * Math.pow(cylVolume / Math.max(count, 1), 1 / 3);
  minDist = Math.max(
    clusterSize * CLOUD_LABEL_MIN_SEP_FLOOR_FR,
    Math.min(clusterSize * CLOUD_LABEL_MIN_SEP_CAP_FR, minDist)
  );

  for (let round = 0; round < CLOUD_LABEL_MAX_PLACE_ROUNDS; round++) {
    const maxAp = CLOUD_LABEL_MAX_ATTEMPTS_PER_POINT + round * 400;
    const placed = tryPlaceCloudLabels(count, diskRadius, spreadZHalf, minDist, maxAp);
    if (placed) {
      return placed;
    }
    minDist *= CLOUD_LABEL_MIN_RELAX;
  }

  // Hard cap: micro-separation so rejection succeeds with very high attempt budget.
  const floorD = Math.max(clusterSize * 1e-4, minDist * 0.25);
  let last = tryPlaceCloudLabels(count, diskRadius, spreadZHalf, floorD, 120_000);
  if (last) {
    return last;
  }
  last = tryPlaceCloudLabels(count, diskRadius, spreadZHalf, clusterSize * 1e-5, 200_000);
  if (last) {
    return last;
  }

  const fallback: THREE.Vector3[] = [];
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    sampleUniformInCloudCylinder(diskRadius, spreadZHalf, s);
    fallback.push(new THREE.Vector3().copy(s));
  }
  return fallback;
}

const ARTIST_MEDIA_PLACEHOLDER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="universe3d-card__media-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>';

type ClusterConfig = {
  genreCode: string;
  center: THREE.Vector3;
  color: THREE.Color;
  artists: SceneArtist[];
};

type ClusterLabelRef = {
  sprite: THREE.Sprite;
  center: THREE.Vector3;
};

export class Universe3D {
  private containerEl: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cloudGroups: THREE.Group[] = [];
  private clusterLabels: ClusterLabelRef[] = [];

  private clock = new THREE.Clock();
  private animationId: number | null = null;

  private targetZ = 2;
  private minCameraZ = 0.5;
  private maxCameraZ = 6;
  private targetX = 0;
  private targetY = 0;
  private zoomVelocity = 0;
  private pinchVelocity = 0;
  private lastPinchDelta = 0;
  private lastPinchTime = 0;
  private isTouchActive = false;
  private panVelocityX = 0;
  private panVelocityY = 0;
  private isCloudDampingEnabled = true;
  private isAutoMoving = false;
  private deferInitialFocus = false;
  private pendingFocusSlug: string | null = null;
  private pendingFocusObject: THREE.Object3D | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private clickableNodes: THREE.Object3D[] = [];
  private hoveredObject: THREE.Object3D | null = null;
  private readonly hoverLerpWhite = new THREE.Color(0xffffff);
  private readonly searchGoldColor = new THREE.Color(0xfaab1f);
  private searchActive = false;
  private searchMatchedSlugSet = new Set<string>();
  /** Search / cinematic nav: stronger highlight while card is anchored. */
  private navigationActiveObject: THREE.Object3D | null = null;
  private readonly navAmbientColor = new THREE.Color(0x5ec9f5);
  private uiLayer!: HTMLElement;
  private activeCard: HTMLElement | null = null;
  /** Mesh the card is tied to; position is reprojected on resize and each frame. */
  private cardAnchorObject: THREE.Object3D | null = null;
  private onPlayArtist?: (artist: SceneArtist) => boolean | Promise<boolean>;
  private onNavigateToArtist?: (publicSlug: string) => void;
  private buildArtistProfileHrefFn?: (publicSlug: string) => string;
  private useContainerSize = false;
  private resizeObserver: ResizeObserver | null = null;
  private attachedWindowClick = false;
  /** Hero embed: larger cloud + closer camera for artist profile strip. */
  private isHeroPreview = false;
  private clusterColorOption?: number;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastPinchDistance = 0;
  private lastPinchCenterX = 0;
  private lastPinchCenterY = 0;
  private lastMoveTime = 0;
  private lastTapTime = 0;
  private tapTimeout: number | null = null;
  private ignoreClickUntil = 0;

  private touchStartX = 0;
  private touchStartY = 0;
  /** True after movement exceeds threshold (single-finger pan). */
  private touchPanCommitted = false;
  /** True if two-finger pinch occurred in this gesture. */
  private touchHadPinch = false;
  private heroTime = 0;

  private tempVec3 = new THREE.Vector3();
  /** Lerp(1.3, 0.5, smooth) from distance to nearest cloud; mouse/touch read between frames. */
  private proximityPanFactor = 1.3;
  private labelTextureCache = new Map<string, THREE.CanvasTexture>();

  constructor(
    container: HTMLElement,
    artists: SceneArtist[] = [],
    options?: {
      onPlayArtist?: (artist: SceneArtist) => boolean | Promise<boolean>;
      onNavigateToArtist?: (publicSlug: string) => void;
      buildArtistProfileHref?: (publicSlug: string) => string;
      clusterColor?: number;
      disableCameraControls?: boolean;
      embedInContainer?: boolean;
      isHeroPreview?: boolean;
    }
  ) {
    this.labelTextureCache.clear();
    this.containerEl = container;
    this.clusterColorOption = options?.clusterColor;
    this.useContainerSize = options?.embedInContainer === true;
    this.isHeroPreview = options?.isHeroPreview === true;

    this.scene = new THREE.Scene();
    if (this.isHeroPreview) {
      this.targetX = 0;
      this.targetY = 0;
    }

    const sizeW = this.useContainerSize ? Math.max(1, container.clientWidth) : window.innerWidth;
    const sizeH = this.useContainerSize ? Math.max(1, container.clientHeight) : window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(70, sizeW / sizeH, 0.1, 1000);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, 2);

    if (options?.isHeroPreview) {
      this.camera.position.z = 0.92;
      this.targetZ = 0.92;
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(sizeW, sizeH);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    container.appendChild(canvas);

    const ui = document.createElement('div');
    ui.className = 'universe3d-ui-layer';
    container.appendChild(ui);
    this.uiLayer = ui;
    this.onPlayArtist = options?.onPlayArtist;
    this.onNavigateToArtist = options?.onNavigateToArtist;
    this.buildArtistProfileHrefFn = options?.buildArtistProfileHref;

    const clusters = this.buildClusters(artists);
    const focusSlug = sessionStorage.getItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY);
    let biggestCluster: ClusterConfig | null = null;
    for (const cluster of clusters) {
      if (!biggestCluster || cluster.artists.length > biggestCluster.artists.length) {
        biggestCluster = cluster;
      }
    }

    if (clusters.length > 0) {
      const zValues = clusters.map((c) => c.center.z);
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      const padding = 10;

      this.minCameraZ = Math.min(minZ - padding, 0.5);
      this.maxCameraZ = maxZ + padding;
      this.targetZ = THREE.MathUtils.clamp(this.targetZ, this.minCameraZ, this.maxCameraZ);
    }

    this.cloudGroups = clusters.map((cluster) =>
      this.createCloud(cluster.color, cluster.center, cluster.artists)
    );
    this.deferInitialFocus = true;

    if (focusSlug) {
      this.pendingFocusSlug = focusSlug;
    } else if (biggestCluster) {
      const targetGroup = this.cloudGroups.find(
        (group) => group.position.distanceTo(biggestCluster!.center) < 0.001
      );
      if (targetGroup) {
        this.pendingFocusObject = targetGroup;
      }
    }
    this.cloudGroups.forEach((group) => this.scene.add(group));

    this.clusterLabels = clusters.map((cluster) => {
      const labelText = this.getClusterLabelText(cluster);
      const sprite = this.createClusterLabel(labelText, cluster.color);
      const clusterSize = Math.sqrt(Math.max(4, cluster.artists.length) / 4);
      const offsetY = clusterSize * 0.6;

      sprite.position.set(cluster.center.x, cluster.center.y + offsetY, cluster.center.z);
      this.scene.add(sprite);
      return {
        sprite,
        center: cluster.center.clone(),
      };
    });

    if (this.isHeroPreview) {
      const heroCloudScale = 1.8;
      this.cloudGroups.forEach((group) => group.scale.multiplyScalar(heroCloudScale));
    }

    if (options?.disableCameraControls !== true) {
      this.initControls();
    }

    if (!this.isHeroPreview) {
      this.initArtistHoverCursor();
    }

    if (options?.isHeroPreview !== true) {
      window.addEventListener('click', this.onClick);
      window.addEventListener('keydown', this.handleKeyDown);
      this.attachedWindowClick = true;
    }

    window.addEventListener('profile-name-updated', this.onProfileDisplayNameUpdated);
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);

    if (this.useContainerSize) {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(container);
    }

    this.animate();
  }

  focusOnArtist(slug: string) {
    const normalized = slug.trim();
    if (!normalized) return;

    const target = this.clickableNodes.find(
      (obj) => (obj.userData as SceneArtist | undefined)?.publicSlug === normalized
    );

    if (!target) return;

    this.focusOnObject(target);
  }

  /** Live search: highlight matches, dim others; pass null to reset. */
  setSearchHighlight(matchedSlugs: string[] | null) {
    if (!matchedSlugs?.length) {
      this.searchActive = false;
      this.searchMatchedSlugSet.clear();
      return;
    }
    this.searchActive = true;
    this.searchMatchedSlugSet = new Set(matchedSlugs);
  }

  /** Main Universe3D only: same activation as scene click (includes label sprites). */
  tryActivateArtistFromClick(event: MouseEvent): boolean {
    if (this.isHeroPreview) return false;
    return this.activateArtistFromClientEvent(event, { dismissCardOnMiss: false });
  }

  /** Main Universe3D only: keyboard activation for single-artist focus. */
  activatePrimaryArtist(): boolean {
    if (this.isHeroPreview) return false;
    if (this.clickableNodes.length !== 1) return false;
    this.handleArtistNodeActivation(this.clickableNodes[0]);
    return true;
  }

  isArtistCardTarget(target: EventTarget | null): boolean {
    return !!(this.activeCard && target instanceof Node && this.activeCard.contains(target));
  }

  /** Cinematic in-scene navigation from search (fly-to + active node + card). */
  navigateToArtistFromSearch(slug: string) {
    const normalized = slug.trim();
    if (!normalized) return;

    const target = this.clickableNodes.find(
      (obj) => (obj.userData as SceneArtist | undefined)?.publicSlug === normalized
    );
    if (!target) return;

    this.setSearchHighlight(null);
    this.navigationActiveObject = target;

    if (this.activeCard) {
      this.dismissCard();
    }

    const pos = new THREE.Vector3();
    target.getWorldPosition(pos);
    const desiredZ = THREE.MathUtils.clamp(pos.z + 1.5, this.minCameraZ, this.maxCameraZ);

    this.moveTo(
      pos.x,
      pos.y,
      desiredZ,
      () => {
        if (this.navigationActiveObject !== target) return;
        this.showCard(target, { skipFocus: true });
      },
      { cinematic: true }
    );
  }

  public setCloudDamping(enabled: boolean) {
    this.isCloudDampingEnabled = enabled;
  }

  private buildClusters(artists: SceneArtist[]): ClusterConfig[] {
    const grouped = new Map<string, SceneArtist[]>();

    artists.forEach((artist) => {
      const genreCode = artist.genreCode || 'other';
      const bucket = grouped.get(genreCode) ?? [];
      bucket.push(artist);
      grouped.set(genreCode, bucket);
    });

    const genreCodes = Array.from(grouped.keys());

    const count = genreCodes.length || 1;

    const clusterSizes = genreCodes.map((code) => {
      const artistsCount = (grouped.get(code) ?? []).length;
      return Math.sqrt(Math.max(4, artistsCount) / 4);
    });

    const maxClusterSize = Math.max(...clusterSizes);

    const maxSpiralRadius = CLOUD_INNER_RADIUS_FACTOR * CLOUD_ARTIST_DISK_FR * maxClusterSize;

    const minDist = 2 * maxSpiralRadius + 6;

    const densityFactor = THREE.MathUtils.clamp(count / 6, 0.4, 1);

    const baseRadius = maxSpiralRadius * 2.2;

    // мягкий рост радиуса без взрывов при малом count
    const radius = baseRadius * Math.pow(count, 0.5) * densityFactor;

    const palette = [0x4d80ff, 0xff8a47, 0x53d8a2, 0xb086ff, 0xf2cd5d, 0x5ec9f5];
    const externalColor = artists[0]?.clusterColor ?? this.clusterColorOption;

    const depthRange = 40 * THREE.MathUtils.clamp(count / 6, 0.4, 1);
    const getZ = () => (this.isHeroPreview ? 0 : (Math.random() - 0.5) * depthRange);

    return genreCodes.map((genreCode, index) => {
      const angle = (index / count) * Math.PI * 2;

      return {
        genreCode,
        center: new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, getZ()),
        color: new THREE.Color(externalColor ?? palette[index % palette.length]),
        artists: grouped.get(genreCode) ?? [],
      };
    });
  }

  private createClusterLabel(text: string, color: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = 512 * dpr;
    canvas.height = 128 * dpr;

    canvas.style.width = '512px';
    canvas.style.height = '128px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 512, 128);

    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);

    ctx.font = '700 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;

    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
    ctx.shadowBlur = 6;

    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.5, 1.0, 1);

    return sprite;
  }

  private getClusterLabelText(cluster: ClusterConfig): string {
    const langKey = document.documentElement.lang?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const fromArtist = cluster.artists.find((a) => a.genreLabel)?.genreLabel?.[langKey];
    return fromArtist || cluster.genreCode;
  }

  private createMaterial(color: THREE.Color, offset: number) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        u_time: { value: offset },
        u_color: { value: color },
        u_distort: {
          value: new THREE.Vector2(0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.6),
        },
        u_seed: { value: Math.random() * 10 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;

        varying vec2 vUv;
        uniform float u_time;
        uniform vec3 u_color;
        uniform vec2 u_distort;
        uniform float u_seed;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);

          float a = hash(i);
          float b = hash(i + vec2(1.0,0.0));
          float c = hash(i + vec2(0.0,1.0));
          float d = hash(i + vec2(1.0,1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(a,b,u.x) +
                 (c - a)*u.y*(1.0-u.x) +
                 (d - b)*u.x*u.y;
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_distort.x;
          uv.y *= u_distort.y;

          float warp =
            sin(uv.x * 3.0 + u_seed) * 0.1 +
            sin(uv.y * 4.0 - u_seed) * 0.1;
          float distortion = fbm(uv * 2.5 + u_seed);
          float d = length(uv + warp * 0.5 + distortion * 0.3);
          float shape = smoothstep(1.2, 0.2, d);
          float core = smoothstep(0.4, 0.0, d);
          core = pow(core, 1.8);
          float edgeFade = 1.0 - smoothstep(0.35, 0.75, length(vUv - 0.5));
          shape *= edgeFade;

          vec2 flow = uv * 2.0;
          flow += vec2(u_time * 0.03, u_time * 0.02);

          float n = fbm(flow);

          float density = shape * n;
          density += shape * 0.25;
          float holes = smoothstep(0.4, 0.7, n);
          density *= (1.0 - holes * 0.6);
          float coreNoise = fbm(uv * 3.0 + u_seed * 2.0);
          core *= mix(0.7, 1.2, coreNoise);
          vec3 colorA = u_color;
          vec3 colorB = u_color * 0.5 + vec3(0.2, 0.1, 0.3);
          vec3 color = mix(colorA, colorB, n);
          color *= density;
          vec3 coreColor = mix(u_color, vec3(1.0), 0.3);
          color = mix(color, coreColor, core * 0.6);

          gl_FragColor = vec4(color, density * 0.6);
        }
      `,
    });
  }

  private truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;

    const ellipsis = '…';
    let truncated = text;

    while (truncated.length > 0) {
      truncated = truncated.slice(0, -1);
      const candidate = `${truncated}${ellipsis}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        return candidate;
      }
    }

    // Если помещается только сама ellipsis, а не добавка после среза — вернем ее.
    if (ctx.measureText(ellipsis).width <= maxWidth) return ellipsis;
    return '';
  }

  private splitTextToLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines;
  }

  private createArtistLabelSprite(name: string): THREE.Sprite {
    let texture = this.labelTextureCache.get(name);
    if (!texture) {
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;

      canvas.width = 256 * dpr;
      canvas.height = 64 * dpr;

      canvas.style.width = '256px';
      canvas.style.height = '64px';

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, 256, 64);

      ctx.fillStyle = 'white';
      ctx.font = '24px Arial';
      const maxWidth = 256 - 20;
      const lines = this.splitTextToLines(ctx, name, maxWidth);

      let displayLines: string[];
      if (lines.length <= 2) {
        displayLines = lines;
      } else {
        const firstLine = lines[0] ?? '';
        let secondLine = lines[1] ?? '';

        while (ctx.measureText(`${secondLine}…`).width > maxWidth && secondLine.length > 0) {
          secondLine = secondLine.slice(0, -1);
        }

        displayLines = [firstLine, `${secondLine}…`];
      }

      displayLines = displayLines.map((line) => this.truncateText(ctx, line, maxWidth));

      const lineHeight = 24;
      const startY = 28;
      displayLines.forEach((line, i) => {
        ctx.fillText(line, 10, startY + i * lineHeight);
      });

      texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      this.labelTextureCache.set(name, texture);
    }

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.5, 0.12, 1);
    sprite.userData.isLabel = true;
    return sprite;
  }

  private disposeArtistLabelSprite(sprite: THREE.Sprite) {
    const material = sprite.material as THREE.SpriteMaterial;
    // Cached texture can be shared between multiple sprites by name.
    material.dispose();
    this.scene.remove(sprite);
  }

  private createCloud(color: THREE.Color, position: THREE.Vector3, users: SceneArtist[]) {
    const group = new THREE.Group();

    const roster = users;
    const n = Math.max(1, roster.length);
    /** >=1; grows with √n so more labels → more spacing (legacy box ≈4 artists @ factor 1). */
    const clusterSize = Math.sqrt(Math.max(4, n) / 4);
    const innerRadiusMax = CLOUD_INNER_RADIUS_FACTOR * clusterSize;
    const spreadZ = 0.85 * clusterSize;
    const diskRadius = innerRadiusMax * CLOUD_ARTIST_DISK_FR;
    const spreadZHalf = spreadZ * CLOUD_ARTIST_Z_FR * 0.5;

    const labelPositions = sampleCloudLabelPositionsWithMinSep(
      roster.length,
      diskRadius,
      spreadZHalf,
      clusterSize
    );

    const geometry = new THREE.PlaneGeometry(3, 3);

    for (let i = 0; i < 5; i++) {
      const material = this.createMaterial(color, i * 5);
      const layer = new THREE.Mesh(geometry, material);

      layer.scale.setScalar(clusterSize);
      layer.position.z = -i * 0.5 * clusterSize;
      layer.position.x = (Math.random() - 0.5) * 0.3 * clusterSize;
      layer.position.y = (Math.random() - 0.5) * 0.3 * clusterSize;
      if (this.isHeroPreview) {
        layer.userData.isHeroCloud = true;
      }

      group.add(layer);
    }

    // 🔥 Группы: случайно в цилиндре внутри облака + минимальный 3D зазор между метками
    roster.forEach((user, i) => {
      const geo = new THREE.SphereGeometry(0.07, 16, 16);

      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
      });

      const mesh = new THREE.Mesh(geo, mat);

      const pos = labelPositions[i]!;
      mesh.position.copy(pos);
      const z = pos.z;
      const zNorm = spreadZ > 1e-6 ? z / (spreadZ * CLOUD_ARTIST_Z_FR) : 0;
      const scale = 0.05 + (1 - (zNorm + 1) / 2) * 0.1;
      mesh.scale.setScalar(scale);

      mesh.userData = user;
      mesh.userData.label = null;
      mesh.userData.baseColor = color.clone();
      mesh.userData.hoverProgress = 0;
      mesh.userData.searchHighlightProgress = 0;
      mesh.userData.searchDimProgress = 0;
      mesh.userData.navActiveProgress = 0;

      const ambientGeo = new THREE.SphereGeometry(0.16, 12, 12);
      const ambientMat = new THREE.MeshBasicMaterial({
        color: this.navAmbientColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ambient = new THREE.Mesh(ambientGeo, ambientMat);
      ambient.visible = false;
      mesh.add(ambient);
      mesh.userData.navAmbient = ambient;

      const ringGeo = new THREE.TorusGeometry(0.11, 0.007, 8, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.searchGoldColor,
        transparent: true,
        opacity: 0,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.visible = false;
      mesh.add(ring);
      mesh.userData.searchRing = ring;

      if (!user.publicSlug.startsWith('__preview__')) {
        this.clickableNodes.push(mesh);
      }

      group.add(mesh);
    });

    group.position.copy(position);

    return group;
  }

  private onProfileDisplayNameUpdated = (event: Event) => {
    const e = event as CustomEvent<ProfileNameUpdatedDetail>;
    const name = e.detail?.name?.trim();
    if (!name) return;
    const slug = e.detail?.publicSlug?.trim();
    if (!slug) return;

    for (const mesh of this.clickableNodes) {
      const u = mesh.userData as SceneArtist;
      if (u.publicSlug !== slug) continue;
      u.name = name;
      const sprite = mesh.userData.label as THREE.Sprite | null;
      if (sprite) {
        this.disposeArtistLabelSprite(sprite);
        mesh.userData.label = null;
      }
    }

    if (this.activeCard && this.cardAnchorObject) {
      const anchorData = this.cardAnchorObject.userData as SceneArtist;
      if (anchorData.publicSlug === slug) {
        anchorData.name = name;
        const titleEl = this.activeCard.querySelector('.universe3d-card__title');
        if (titleEl) {
          titleEl.textContent = name;
        }
      }
    }
  };

  private onClick = (event: MouseEvent) => {
    this.activateArtistFromClientEvent(event, { dismissCardOnMiss: true });
  };

  private activateArtistFromClientEvent(
    event: MouseEvent,
    options?: { dismissCardOnMiss?: boolean }
  ): boolean {
    if (Date.now() < this.ignoreClickUntil) {
      return false;
    }

    if (isUniverseSceneOverlayTarget(event.target)) {
      return false;
    }

    if (this.activeCard && event.target instanceof Node && this.activeCard.contains(event.target)) {
      return false;
    }

    this.updateMouseFromClientEvent(event);

    const intersects = this.raycaster.intersectObjects(this.clickableNodes, true);

    for (let i = 0; i < intersects.length; i++) {
      const artistNode = this.resolveArtistNodeFromIntersection(intersects[i].object);
      if (artistNode) {
        this.handleArtistNodeActivation(artistNode);
        return true;
      }
    }

    const labelSprites = this.collectVisibleArtistLabelSprites();
    if (labelSprites.length > 0) {
      const labelHits = this.raycaster.intersectObjects(labelSprites, false);
      for (let i = 0; i < labelHits.length; i++) {
        const artistNode = this.resolveArtistNodeFromLabelSprite(
          labelHits[i].object as THREE.Sprite
        );
        if (artistNode) {
          this.handleArtistNodeActivation(artistNode);
          return true;
        }
      }
    }

    if (options?.dismissCardOnMiss && this.activeCard) {
      this.dismissCard();
    }

    return false;
  }

  private updateMouseFromClientEvent(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  private collectVisibleArtistLabelSprites(): THREE.Sprite[] {
    const sprites: THREE.Sprite[] = [];
    for (const mesh of this.clickableNodes) {
      const sprite = mesh.userData?.label as THREE.Sprite | null;
      if (!sprite?.visible) continue;
      const opacity = (sprite.material as THREE.SpriteMaterial).opacity;
      if (opacity > 0.01) {
        sprites.push(sprite);
      }
    }
    return sprites;
  }

  private resolveArtistNodeFromLabelSprite(sprite: THREE.Sprite): THREE.Object3D | null {
    for (const mesh of this.clickableNodes) {
      if (mesh.userData?.label === sprite) return mesh;
    }
    return null;
  }

  private dismissCard() {
    this.activeCard?.remove();
    this.activeCard = null;
    this.cardAnchorObject = null;
    this.navigationActiveObject = null;
  }

  private isEditableKeyTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private resolveArtistNodeFromIntersection(object: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData?.name) return current;
      current = current.parent;
    }
    return null;
  }

  private handleArtistNodeActivation(obj: THREE.Object3D): void {
    if (this.activeCard && this.cardAnchorObject === obj) {
      this.dismissCard();
      return;
    }
    this.showCard(obj);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.activeCard) return;
    if (this.isEditableKeyTarget(e.target)) return;
    e.preventDefault();
    this.dismissCard();
  };

  /** Viewport Y (px): max bottom edge of the card (above scroll hint / mini-player / viewport). */
  private getViewportBottomLimitY(): number {
    const margin = 16;
    const gapAboveChrome = 12;

    const scrollHint = document.querySelector('.universe-scroll-hint');
    if (scrollHint) {
      return scrollHint.getBoundingClientRect().top - gapAboveChrome;
    }

    const mini = document.querySelector('.mini-player');
    if (mini) {
      return mini.getBoundingClientRect().top - gapAboveChrome;
    }

    const vv = window.visualViewport;
    const h = vv?.height ?? window.innerHeight;
    return h - margin;
  }

  private isMobile(): boolean {
    return window.innerWidth < 768;
  }

  private centerCard(card: HTMLElement) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = card.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const left = (vw - w) / 2;
    const top = (vh - h) / 2;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  /** Project cluster point to coordinates inside `uiLayer` (matches position:absolute). */
  private projectObjectToLayer(obj: THREE.Object3D): { x: number; y: number } {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    worldPos.project(this.camera);

    const canvas = this.renderer.domElement;
    const cRect = canvas.getBoundingClientRect();
    const layerRect = this.uiLayer.getBoundingClientRect();

    const xV = (worldPos.x * 0.5 + 0.5) * cRect.width + cRect.left;
    const yV = (-worldPos.y * 0.5 + 0.5) * cRect.height + cRect.top;

    return {
      x: xV - layerRect.left,
      y: yV - layerRect.top,
    };
  }

  /** Full layout: measure height, optional scroll, clamp so the card stays in the safe rect. */
  private layoutCard(card: HTMLElement, anchorX: number, anchorY: number) {
    const margin = 16;
    const layerRect = this.uiLayer.getBoundingClientRect();
    const bottomLimitViewport = this.getViewportBottomLimitY();
    const maxBottomLocal = bottomLimitViewport - layerRect.top;
    const minTopLocal = Math.max(0, margin - layerRect.top);
    const availableHeight = Math.max(120, maxBottomLocal - minTopLocal);

    card.style.maxHeight = '';
    card.style.minHeight = '';
    card.style.overflowY = '';

    let rect = card.getBoundingClientRect();
    let h = rect.height;
    const w = rect.width;

    if (h > availableHeight) {
      card.style.minHeight = '0';
      card.style.maxHeight = `${availableHeight}px`;
      card.style.overflowY = 'auto';
      rect = card.getBoundingClientRect();
      h = rect.height;
    }

    if (this.isMobile()) {
      this.centerCard(card);
    } else {
      this.positionCardAtAnchor(card, anchorX, anchorY, h, w);
    }
  }

  /**
   * Place card near projected point using layer + viewport bounds.
   * Pass h/w from a fresh measure; if omitted, reads from DOM (e.g. per-frame follow).
   */
  private positionCardAtAnchor(
    card: HTMLElement,
    anchorX: number,
    anchorY: number,
    h?: number,
    w?: number
  ) {
    const margin = 16;
    const layerRect = this.uiLayer.getBoundingClientRect();
    const bottomLimitViewport = this.getViewportBottomLimitY();
    const maxBottomLocal = bottomLimitViewport - layerRect.top;
    const minTopLocal = Math.max(0, margin - layerRect.top);
    const minLeftLocal = Math.max(0, margin - layerRect.left);
    const maxRightViewport = window.innerWidth - margin;

    const rect = card.getBoundingClientRect();
    const hh = h ?? rect.height;
    const ww = w ?? rect.width;

    const offsetX = 22;
    const offsetY = -90;

    let left = anchorX + offsetX;
    let top = anchorY + offsetY;

    const maxLeft = Math.min(layerRect.width - ww, maxRightViewport - layerRect.left - ww);
    left = THREE.MathUtils.clamp(left, minLeftLocal, Math.max(minLeftLocal, maxLeft));

    const maxTop = maxBottomLocal - hh;
    top = THREE.MathUtils.clamp(top, minTopLocal, Math.max(minTopLocal, maxTop));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  private layoutCardFromObject() {
    if (!this.activeCard || !this.cardAnchorObject) return;
    const { x, y } = this.projectObjectToLayer(this.cardAnchorObject);
    this.layoutCard(this.activeCard, x, y);
  }

  /**
   * Same-origin relative URLs and absolute http(s)://localhost URLs must use the
   * current page origin so images work on phones (LAN IP) instead of resolving to device localhost.
   */
  private resolveHeaderImageUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      const u = new URL(trimmed, window.location.href);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
      }
      return u.href;
    } catch {
      return trimmed;
    }
  }

  /** Fallback href for artist profile links when SPA navigation is unavailable. */
  private buildArtistProfileHref(publicSlug: string): string {
    return this.buildArtistProfileHrefFn?.(publicSlug) ?? '#';
  }

  private handleArtistProfileNavigation(slug: string, event: Event): void {
    event.stopPropagation();
    if (this.onNavigateToArtist) {
      event.preventDefault();
      this.dismissCard();
      this.onNavigateToArtist(slug);
    } else {
      this.dismissCard();
    }
  }

  private bindArtistProfileLink(link: HTMLAnchorElement, slug: string): void {
    link.href = this.buildArtistProfileHref(slug);
    link.addEventListener('click', (event) => {
      this.handleArtistProfileNavigation(slug, event);
    });
  }

  private appendArtistMediaPlaceholder(mediaEl: Element): void {
    const placeholder = document.createElement('div');
    placeholder.className = 'universe3d-card__media-placeholder';
    placeholder.innerHTML = ARTIST_MEDIA_PLACEHOLDER_ICON_SVG;
    mediaEl.appendChild(placeholder);
  }

  private moveTo(
    x: number,
    y: number,
    z: number,
    onComplete?: () => void,
    options?: { cinematic?: boolean }
  ) {
    this.isAutoMoving = true;

    const startX = this.targetX;
    const startY = this.targetY;
    const startZ = this.targetZ;

    const distance = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2 + (z - startZ) ** 2);

    const duration = options?.cinematic
      ? THREE.MathUtils.clamp(distance * 0.38, 0.95, 2.4)
      : THREE.MathUtils.clamp(distance * 0.25, 0.6, 1.4);
    const startTime = performance.now();

    const step = () => {
      const t = Math.min((performance.now() - startTime) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - t, 4); // easeOutCubic

      this.targetX = startX + (x - startX) * ease;
      this.targetY = startY + (y - startY) * ease;
      this.targetZ = startZ + (z - startZ) * ease;

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.isAutoMoving = false;
        onComplete?.();
      }
    };

    step();
  }

  private focusOnObject(obj: THREE.Object3D) {
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);

    const desiredZ = THREE.MathUtils.clamp(pos.z + 1.5, this.minCameraZ, this.maxCameraZ);

    this.moveTo(pos.x, pos.y, desiredZ);
  }

  private showCard(obj: THREE.Object3D, options?: { skipFocus?: boolean }) {
    if (this.activeCard) {
      this.dismissCard();
    }

    if (!options?.skipFocus) {
      this.focusOnObject(obj);
    }

    this.cardAnchorObject = obj;

    const data = obj.userData as Partial<SceneArtist>;
    const title = data.name ?? 'Unknown artist';
    const genreCode = data.genreCode ?? 'other';
    const langKey = document.documentElement.lang?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const label = data.genreLabel?.[langKey] ?? genreCode;
    const coverUrl =
      Array.isArray(data.headerImages) && data.headerImages.length > 0 ? data.headerImages[0] : '';
    const slug = typeof data.publicSlug === 'string' ? data.publicSlug.trim() : '';

    const card = document.createElement('div');
    card.className = 'universe3d-card';
    card.style.visibility = 'hidden';
    card.innerHTML = `
      ${slug ? '<a class="universe3d-card__media"></a>' : '<div class="universe3d-card__media" aria-hidden="true"></div>'}
      <div class="universe3d-card__body">
        <div class="universe3d-card__title"></div>
        <div class="universe3d-card__chips">
          <span class="universe3d-card__chip">${label}</span>
        </div>
      </div>
      <div class="universe3d-card__footer">
        <button class="universe3d-card__play" type="button">Play</button>
      </div>
    `;

    const titleSlot = card.querySelector('.universe3d-card__title');
    if (titleSlot) {
      if (slug) {
        const link = document.createElement('a');
        link.className = 'universe3d-card__title';
        link.textContent = title;
        this.bindArtistProfileLink(link, slug);
        titleSlot.replaceWith(link);
      } else {
        titleSlot.textContent = title;
      }
    }

    const mediaEl = card.querySelector('.universe3d-card__media');
    if (mediaEl instanceof HTMLAnchorElement && slug) {
      this.bindArtistProfileLink(mediaEl, slug);
    }
    if (mediaEl) {
      if (coverUrl) {
        const img = document.createElement('img');
        img.className = 'universe3d-card__media-image';
        img.alt = title;
        img.loading = 'eager';
        img.decoding = 'async';
        img.src = this.resolveHeaderImageUrl(coverUrl);
        img.addEventListener('load', () => {
          if (this.activeCard !== card || !this.cardAnchorObject) return;
          this.layoutCardFromObject();
        });
        mediaEl.appendChild(img);
      } else {
        mediaEl.classList.add('universe3d-card__media--empty');
        if (mediaEl instanceof HTMLAnchorElement) {
          mediaEl.setAttribute('aria-label', title);
        }
        this.appendArtistMediaPlaceholder(mediaEl);
      }
    }

    const playButton = card.querySelector('.universe3d-card__play');
    if (playButton instanceof HTMLButtonElement) {
      playButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.onPlayArtist) return;
        const started = await this.onPlayArtist(data as SceneArtist);
        if (started) {
          this.dismissCard();
        }
      });
    }

    this.uiLayer.appendChild(card);
    this.activeCard = card;

    requestAnimationFrame(() => {
      if (this.activeCard !== card || !this.cardAnchorObject) return;
      this.layoutCardFromObject();
      card.style.visibility = '';
    });
  }

  private initControls() {
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd);
    canvas.addEventListener('touchcancel', this.handleTouchCancel);
  }

  private initArtistHoverCursor() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousemove', this.handleArtistHoverCursor);
    canvas.addEventListener('mouseleave', this.handleArtistHoverCursorLeave);
  }

  private isInteractionLocked() {
    return this.activeCard !== null;
  }

  private handleWheel = (e: WheelEvent) => {
    if (this.isInteractionLocked()) {
      e.preventDefault();
      return;
    }

    if (isUniverseSceneOverlayTarget(e.target)) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();

    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (e.ctrlKey) {
      e.preventDefault();
    }

    e.preventDefault();

    // Wheel (2-finger scroll) и trackpad pinch (ctrlKey) -> одна система velocity.
    // Движение камеры применяем в animate(), а сюда кладем только импульс (замедление у облаков — zoomScale в animate).
    const WHEEL_VELOCITY_SCALE = e.ctrlKey ? 0.02 : 0.008;

    const baseDelta = -e.deltaY;
    const normalizedDelta = e.ctrlKey ? baseDelta * 2.5 : baseDelta;
    this.zoomVelocity += normalizedDelta * WHEEL_VELOCITY_SCALE;
    this.zoomVelocity = THREE.MathUtils.clamp(this.zoomVelocity, -8, 8);
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isInteractionLocked()) return;
    if (isUniverseSceneOverlayTarget(e.target)) return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handleMouseUp = () => {
    this.isDragging = false;
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging || this.isInteractionLocked()) return;
    if (isUniverseSceneOverlayTarget(e.target)) {
      this.isDragging = false;
      return;
    }

    const rawDx = e.clientX - this.lastPointerX;
    const rawDy = e.clientY - this.lastPointerY;

    const PAN_BASE = 0.004;

    // используем ТОЛЬКО proximity (у тебя уже есть panFactor из animate)
    const PAN_SENSITIVITY = this.proximityPanFactor;

    const dx = rawDx * PAN_BASE * PAN_SENSITIVITY;
    const dy = rawDy * PAN_BASE * PAN_SENSITIVITY;

    this.targetX -= dx;
    this.targetY += dy;

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handleArtistHoverCursor = (e: MouseEvent) => {
    this.updateArtistHoverCursor(e.clientX, e.clientY);
  };

  private handleArtistHoverCursorLeave = () => {
    this.hoveredObject = null;
    this.renderer.domElement.style.cursor = 'default';
  };

  private updateArtistHoverCursor(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();

    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.clickableNodes, true);

    for (let i = 0; i < intersects.length; i++) {
      const artistNode = this.resolveArtistNodeFromIntersection(intersects[i].object);
      if (artistNode) {
        this.hoveredObject = artistNode;
        this.renderer.domElement.style.cursor = 'pointer';
        return;
      }
    }

    const labelSprites = this.collectVisibleArtistLabelSprites();
    if (labelSprites.length > 0) {
      const labelHits = this.raycaster.intersectObjects(labelSprites, false);
      for (let i = 0; i < labelHits.length; i++) {
        const artistNode = this.resolveArtistNodeFromLabelSprite(
          labelHits[i].object as THREE.Sprite
        );
        if (artistNode) {
          this.hoveredObject = artistNode;
          this.renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
    }

    this.hoveredObject = null;
    this.renderer.domElement.style.cursor = 'default';
  }

  private handleTouchStart = (e: TouchEvent) => {
    this.isTouchActive = true;
    // мгновенно останавливаем любую инерцию
    this.zoomVelocity = 0;
    this.pinchVelocity = 0;
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.lastMoveTime = performance.now();

    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.lastPointerX = e.touches[0].clientX;
      this.lastPointerY = e.touches[0].clientY;
      this.lastMoveTime = performance.now();
      this.touchPanCommitted = false;
      this.touchHadPinch = false;
    }

    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];

      this.lastPinchCenterX = (t1.clientX + t2.clientX) / 2;
      this.lastPinchCenterY = (t1.clientY + t2.clientY) / 2;

      this.lastPinchDistance = 0;
      this.touchHadPinch = true;
      this.touchPanCommitted = false;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 || e.touches.length === 2) {
      e.preventDefault();
    }

    if (this.isInteractionLocked()) {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dxFromStart = t.clientX - this.touchStartX;
        const dyFromStart = t.clientY - this.touchStartY;
        if (Math.abs(dxFromStart) + Math.abs(dyFromStart) > TOUCH_MOVE_THRESHOLD_PX) {
          this.touchPanCommitted = true;
        }
      }
      return;
    }

    if (e.touches.length !== 2) {
      this.lastPinchDistance = 0;
      this.lastPinchCenterX = 0;
      this.lastPinchCenterY = 0;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];

      const dxFromStart = t.clientX - this.touchStartX;
      const dyFromStart = t.clientY - this.touchStartY;

      if (
        !this.touchPanCommitted &&
        Math.abs(dxFromStart) + Math.abs(dyFromStart) > TOUCH_MOVE_THRESHOLD_PX
      ) {
        this.touchPanCommitted = true;
      }

      if (!this.touchPanCommitted) {
        this.lastPointerX = t.clientX;
        this.lastPointerY = t.clientY;
        return;
      }

      const rawDx = t.clientX - this.lastPointerX;
      const rawDy = t.clientY - this.lastPointerY;

      const PAN_BASE = 0.002;
      const PAN_SENSITIVITY = this.proximityPanFactor;

      const dx = rawDx * PAN_BASE * PAN_SENSITIVITY;
      const dy = rawDy * PAN_BASE * PAN_SENSITIVITY;

      this.targetX -= dx;
      this.targetY += dy;

      this.panVelocityX = dx;
      this.panVelocityY = dy;

      this.lastPointerX = t.clientX;
      this.lastPointerY = t.clientY;
    }

    if (e.touches.length === 2) {
      this.touchHadPinch = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      if (this.lastPinchDistance === 0) {
        this.lastPinchDistance = dist;
        this.lastPinchCenterX = centerX;
        this.lastPinchCenterY = centerY;
        return;
      }

      const moveX = centerX - this.lastPinchCenterX;
      const moveY = centerY - this.lastPinchCenterY;

      const panSpeed = 0.0005;
      this.targetX += moveX * panSpeed;
      this.targetY -= moveY * panSpeed;

      const rect = this.renderer.domElement.getBoundingClientRect();

      this.mouse.x = ((centerX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((centerY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const ray = this.raycaster.ray;

      const now = performance.now();

      // scale-based zoom вместо delta
      const scale = dist / this.lastPinchDistance;

      // защита от NaN / Infinity
      if (!isFinite(scale) || scale <= 0) return;

      // логарифмический zoom (как в Google Maps)
      const zoomFactor = Math.log(scale) * 2.5;

      // стабильная скорость без взрывов
      const VELOCITY_MULTIPLIER = 18.0;

      const velocity = zoomFactor * VELOCITY_MULTIPLIER;

      // 🔥 как wheel — добавляем, а не заменяем
      this.zoomVelocity += velocity;

      // clamp
      const limit = this.isTouchActive ? 12 : 8;

      this.zoomVelocity = THREE.MathUtils.clamp(this.zoomVelocity, -limit, limit);
      this.lastMoveTime = now;

      // считаем velocity, но НЕ применяем
      this.lastPinchDelta = zoomFactor;
      const VELOCITY_SMOOTHING = 0.22;
      this.pinchVelocity =
        this.pinchVelocity * (1 - VELOCITY_SMOOTHING) + zoomFactor * VELOCITY_SMOOTHING;
      this.pinchVelocity = THREE.MathUtils.clamp(this.pinchVelocity, -50, 50);

      this.lastPinchCenterX = centerX;
      this.lastPinchCenterY = centerY;
      this.lastPinchDistance = dist;
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      this.lastPinchDistance = 0;
      this.lastPinchCenterX = 0;
      this.lastPinchCenterY = 0;
    }
    if (e.touches.length === 1) {
      const tr = e.touches[0];
      this.lastPointerX = tr.clientX;
      this.lastPointerY = tr.clientY;
      this.touchStartX = tr.clientX;
      this.touchStartY = tr.clientY;
      this.touchPanCommitted = false;
    }
    const t = e.changedTouches[0];
    if (!t) {
      if (e.touches.length === 0) {
        this.resetTouchGestureState();
      }
      return;
    }

    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const moved = Math.abs(dx) + Math.abs(dy);

    const allFingersUp = e.touches.length === 0;

    const isTap =
      allFingersUp &&
      !this.touchPanCommitted &&
      !this.touchHadPinch &&
      moved <= TOUCH_MOVE_THRESHOLD_PX;

    if (isTap) {
      this.performCanvasTouchTap(t.clientX, t.clientY);
    }

    if (allFingersUp) {
      this.isTouchActive = false;

      this.resetTouchGestureState();
    }
  };

  private handleTouchCancel = () => {
    this.resetTouchGestureState();
  };

  private resetTouchGestureState() {
    this.touchPanCommitted = false;
    this.touchHadPinch = false;
    this.lastPinchDistance = 0;
    this.lastPinchCenterX = 0;
    this.lastPinchCenterY = 0;
  }

  /** Raycast tap on canvas (mobile); single tap deferred, double tap focuses hit target. */
  private performCanvasTouchTap(clientX: number, clientY: number) {
    this.ignoreClickUntil = Date.now() + 400;

    const now = performance.now();
    const delta = now - this.lastTapTime;
    const isDoubleTap = delta > 0 && delta < 400;

    this.lastTapTime = now;

    // обновляем ray (оставь это)
    const rect = this.renderer.domElement.getBoundingClientRect();

    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 👉 DOUBLE TAP
    if (isDoubleTap) {
      if (this.tapTimeout) {
        clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }

      // 👉 берём направление камеры (тот же ray что и zoom)
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const ray = this.raycaster.ray;

      const STEP = 1.5;

      // считаем куда хотим прилететь
      const nextX = this.targetX + ray.direction.x * STEP;
      const nextY = this.targetY + ray.direction.y * STEP;
      const nextZ = this.targetZ + ray.direction.z * STEP;

      // ограничиваем Z
      const clampedZ = THREE.MathUtils.clamp(nextZ, this.minCameraZ, this.maxCameraZ);

      // 🔥 ПЛАВНЫЙ ПЕРЕЛЁТ
      this.moveTo(nextX, nextY, clampedZ);

      return;
    }

    // 👉 SINGLE TAP (с задержкой)
    this.tapTimeout = window.setTimeout(() => {
      const intersects = this.raycaster.intersectObjects(this.clickableNodes, true);

      for (let i = 0; i < intersects.length; i++) {
        const artistNode = this.resolveArtistNodeFromIntersection(intersects[i].object);
        if (artistNode) {
          this.handleArtistNodeActivation(artistNode);
          return;
        }
      }

      this.dismissCard();
    }, 250);
  }

  private noise2D(x: number, y: number) {
    return Math.sin(x * 2.1 + y * 3.7) * 0.5 + 0.5;
  }

  private fbm(x: number, y: number) {
    let value = 0;
    let amp = 0.5;

    for (let i = 0; i < 4; i++) {
      value += amp * this.noise2D(x, y);
      x *= 2;
      y *= 2;
      amp *= 0.5;
    }

    return value;
  }

  private animate = () => {
    if (this.deferInitialFocus) {
      this.deferInitialFocus = false;

      if (this.pendingFocusSlug) {
        this.focusOnArtist(this.pendingFocusSlug);
        sessionStorage.removeItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY);
        this.pendingFocusSlug = null;
      } else if (this.pendingFocusObject) {
        this.focusOnObject(this.pendingFocusObject);
        this.pendingFocusObject = null;
      }
    }

    const t = this.clock.getElapsedTime();
    if (this.isHeroPreview) {
      this.heroTime += 0.01;
    }

    // обновление шейдеров облака
    this.cloudGroups.forEach((cloud) => {
      cloud.children.forEach((layer, i) => {
        const mesh = layer as THREE.Mesh;
        const material = mesh.material;
        if (!material || Array.isArray(material)) return;
        const shaderMaterial = material as THREE.ShaderMaterial;
        if (shaderMaterial.uniforms?.u_time) {
          shaderMaterial.uniforms.u_time.value = t + i * 5;
        }
      });
    });

    let nearestCluster: THREE.Group | null = null;
    let minDist = Infinity;

    for (const group of this.cloudGroups) {
      const d = this.camera.position.distanceTo(group.position);
      if (d < minDist) {
        minDist = d;
        nearestCluster = group;
      }
    }

    let proximity = 0;

    if (nearestCluster) {
      const NEAR = 2.5;
      const FAR = 6;
      const dist = minDist;

      proximity = 1 - THREE.MathUtils.clamp((dist - NEAR) / (FAR - NEAR), 0, 1);
    }

    const smooth = proximity * proximity * proximity;
    const zoomScale = THREE.MathUtils.lerp(0.1, 0.035, smooth);
    const panFactor = THREE.MathUtils.lerp(2.8, 0.5, Math.pow(smooth, 0.7));
    this.proximityPanFactor = panFactor;

    const baseDamping = this.isTouchActive ? 0.92 : 0.97;

    const speed = Math.abs(this.zoomVelocity);

    // 👉 считаем "медленным" почти всё
    const FAST_THRESHOLD = 4.0;

    // 👉 сильная вязкость внутри облака
    const INSIDE_DAMPING = 0.7;

    let cloudDamping = baseDamping;

    if (this.isCloudDampingEnabled) {
      cloudDamping =
        speed < FAST_THRESHOLD
          ? THREE.MathUtils.lerp(baseDamping, INSIDE_DAMPING, smooth)
          : baseDamping;
    }

    this.zoomVelocity *= cloudDamping;

    if (this.isCloudDampingEnabled) {
      // 🔥 ограничиваем скорость внутри облака
      const insideSpeedLimit = THREE.MathUtils.lerp(8, 2.5, smooth);

      this.zoomVelocity = THREE.MathUtils.clamp(
        this.zoomVelocity,
        -insideSpeedLimit,
        insideSpeedLimit
      );
    }

    this.panVelocityX *= cloudDamping;
    this.panVelocityY *= cloudDamping;

    // Сглаженный zoom по ray из центра экрана (Google Maps-like).
    if (Math.abs(this.zoomVelocity) > 0.00001) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const ray = this.raycaster.ray;

      const ZOOM_SCALE = zoomScale;

      const isAtMinZ = this.targetZ <= this.minCameraZ + 0.001;
      const isAtMaxZ = this.targetZ >= this.maxCameraZ - 0.001;
      const isAtBoundary = isAtMinZ || isAtMaxZ;

      if (!isAtBoundary) {
        this.targetX += ray.direction.x * this.zoomVelocity * ZOOM_SCALE;
        this.targetY += ray.direction.y * this.zoomVelocity * ZOOM_SCALE;
      }

      this.targetZ += ray.direction.z * this.zoomVelocity * ZOOM_SCALE;

      this.targetZ = THREE.MathUtils.clamp(this.targetZ, this.minCameraZ, this.maxCameraZ);
    } else {
      this.zoomVelocity = 0;
    }

    if (!this.isTouchActive) {
      this.targetX -= this.panVelocityX;
      this.targetY += this.panVelocityY;

      // убираем микродвижение
      const EPS = 0.00001;
      if (Math.abs(this.panVelocityX) < EPS) this.panVelocityX = 0;
      if (Math.abs(this.panVelocityY) < EPS) this.panVelocityY = 0;
    }

    const targetPosition = this.tempVec3.set(this.targetX, this.targetY, this.targetZ);
    this.camera.position.copy(targetPosition);

    // ЛОГИКА ВИДИМОСТИ (главное)
    const temp = this.tempVec3;

    this.clickableNodes.forEach((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.getWorldPosition(temp);
      const distance = this.camera.position.distanceTo(temp);

      const fadeStart = 4;
      const fadeEnd = 1.2;
      const createLabelDistance = 3;

      const t = THREE.MathUtils.clamp((fadeStart - distance) / (fadeStart - fadeEnd), 0, 1);

      const isNavActive = mesh === this.navigationActiveObject;

      let sprite = (mesh.userData?.label as THREE.Sprite | null) ?? null;
      const FADE_SPEED = 0.04;
      const REMOVE_THRESHOLD = 0.02;
      const labelDistance = isNavActive ? fadeStart : createLabelDistance;
      if (distance < labelDistance) {
        if (!sprite) {
          const user = mesh.userData as SceneArtist;
          sprite = this.createArtistLabelSprite(user.name);
          this.scene.add(sprite);
          mesh.userData.label = sprite;
        }
        sprite.position.set(temp.x, temp.y + 0.1, temp.z);
        const material = sprite.material as THREE.SpriteMaterial;
        const labelTarget = isNavActive ? Math.max(t, 0.92) : t;
        material.opacity += (labelTarget - material.opacity) * (isNavActive ? 0.08 : FADE_SPEED);
        sprite.visible = labelTarget > 0.01;
      } else if (sprite && !isNavActive) {
        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity += (0 - material.opacity) * FADE_SPEED;
        sprite.visible = material.opacity > 0.01;

        if (material.opacity < REMOVE_THRESHOLD) {
          this.disposeArtistLabelSprite(sprite);
          mesh.userData.label = null;
          sprite = null;
        }
      }

      const artistData = mesh.userData as SceneArtist;
      const isSearchMatch =
        this.searchActive && this.searchMatchedSlugSet.has(artistData.publicSlug);
      const isSearchDim = this.searchActive && !isSearchMatch;

      const isHovered = !this.isHeroPreview && mesh === this.hoveredObject;
      const isCardActive = this.activeCard !== null;
      const isCardTarget = mesh === this.cardAnchorObject;

      const target = isNavActive || isHovered || (isCardActive && isCardTarget) ? 1 : 0;

      const mat = mesh.material as THREE.MeshBasicMaterial;

      let hp = (mesh.userData.hoverProgress as number) || 0;

      hp += (target - hp) * 0.12;
      mesh.userData.hoverProgress = hp;

      let navHp = (mesh.userData.navActiveProgress as number) || 0;
      navHp += ((isNavActive ? 1 : 0) - navHp) * 0.1;
      mesh.userData.navActiveProgress = navHp;

      let searchHp = (mesh.userData.searchHighlightProgress as number) || 0;
      let searchDim = (mesh.userData.searchDimProgress as number) || 0;
      searchHp += ((isSearchMatch ? 1 : 0) - searchHp) * 0.12;
      searchDim += ((isSearchDim ? 1 : 0) - searchDim) * 0.12;
      mesh.userData.searchHighlightProgress = searchHp;
      mesh.userData.searchDimProgress = searchDim;

      let baseScale = 0.05 + t * 0.15;

      const hoverScale = isNavActive ? 2.15 : 1.8;
      const searchScale = 1.28;
      const navScale = 1.22;
      const finalScale =
        baseScale *
        (1 + hp * (hoverScale - 1)) *
        (1 + searchHp * (searchScale - 1)) *
        (1 + navHp * (navScale - 1));

      const pulse =
        1 +
        Math.sin(performance.now() * 0.005) * 0.05 * hp +
        Math.sin(performance.now() * 0.004) * 0.06 * searchHp +
        Math.sin(performance.now() * 0.0035) * 0.08 * navHp;

      mesh.scale.setScalar(finalScale * pulse);

      const baseCol = mesh.userData.baseColor as THREE.Color;
      mat.color
        .copy(baseCol)
        .lerp(this.hoverLerpWhite, hp * (isNavActive ? 0.55 : 0.4))
        .lerp(this.searchGoldColor, searchHp * 0.55)
        .lerp(this.searchGoldColor, navHp * 0.35);

      let opacity = 0.9 + hp * 0.1 + searchHp * 0.05 + navHp * 0.08;
      opacity *= 1 - searchDim * 0.58;
      mat.opacity = opacity;

      const ring = mesh.userData.searchRing as THREE.Mesh | undefined;
      if (ring) {
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        const targetRingOpacity = Math.max(searchHp * 0.9, navHp);
        ringMat.opacity += (targetRingOpacity - ringMat.opacity) * 0.12;
        ring.visible = ringMat.opacity > 0.02;
        const ringPulse =
          1 + Math.sin(performance.now() * 0.0045) * 0.1 * Math.max(searchHp, navHp);
        ring.scale.setScalar(ringPulse);
        ring.lookAt(this.camera.position);
      }

      const ambient = mesh.userData.navAmbient as THREE.Mesh | undefined;
      if (ambient) {
        const ambientMat = ambient.material as THREE.MeshBasicMaterial;
        const targetAmbient = navHp * 0.22;
        ambientMat.opacity += (targetAmbient - ambientMat.opacity) * 0.1;
        ambient.visible = ambientMat.opacity > 0.01;
        const ambientPulse = 1 + Math.sin(performance.now() * 0.003) * 0.12 * navHp;
        ambient.scale.setScalar(ambientPulse);
      }

      if (sprite && searchDim > 0.01 && !isNavActive) {
        const labelMat = sprite.material as THREE.SpriteMaterial;
        const labelBase = t * (1 - searchDim * 0.72);
        labelMat.opacity = Math.min(labelMat.opacity, labelBase);
      }
    });

    this.clusterLabels.forEach(({ sprite, center }) => {
      const distance = this.camera.position.distanceTo(center);
      const fadeStart = 5;
      const fadeEnd = 3;
      const t = THREE.MathUtils.clamp((fadeStart - distance) / (fadeStart - fadeEnd), 0, 1);
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = t;
      sprite.visible = t > 0.01;

      const minScale = 2.5;
      const maxScale = 6;
      const scaleT = THREE.MathUtils.clamp((6 - distance) / 4, 0, 1);
      const scale = minScale + (maxScale - minScale) * scaleT;
      sprite.scale.set(scale, scale * 0.25, 1);
    });

    if (this.isHeroPreview) {
      this.scene.traverse((obj) => {
        if (obj.userData?.isHeroCloud) {
          const baseScale = 1.8;
          const breath = 1 + Math.sin(this.heroTime) * 0.04;
          obj.scale.setScalar(baseScale * breath);
        }
      });
    }

    // рендер
    this.renderer.render(this.scene, this.camera);

    // обновление карточки
    if (this.activeCard) {
      if (this.isMobile()) {
        this.centerCard(this.activeCard);
      } else if (this.cardAnchorObject) {
        const { x, y } = this.projectObjectToLayer(this.cardAnchorObject);
        this.positionCardAtAnchor(this.activeCard, x, y);
      }
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private onResize = () => {
    if (this.useContainerSize) {
      const w = Math.max(1, this.containerEl.clientWidth);
      const h = Math.max(1, this.containerEl.clientHeight);
      this.camera.aspect = w / h;
      this.renderer.setSize(w, h);
    } else {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    this.camera.updateProjectionMatrix();
    if (this.activeCard && this.cardAnchorObject) {
      this.layoutCardFromObject();
    }
  };

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    if (this.attachedWindowClick) {
      window.removeEventListener('click', this.onClick);
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    window.removeEventListener('profile-name-updated', this.onProfileDisplayNameUpdated);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousemove', this.handleArtistHoverCursor);
    canvas.removeEventListener('mouseleave', this.handleArtistHoverCursorLeave);
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    canvas.removeEventListener('touchend', this.handleTouchEnd);
    canvas.removeEventListener('touchcancel', this.handleTouchCancel);
    this.clickableNodes.forEach((mesh) => {
      const sprite = (mesh.userData?.label as THREE.Sprite | null) ?? null;
      if (!sprite) return;
      this.disposeArtistLabelSprite(sprite);
      mesh.userData.label = null;
    });
    this.dismissCard();
    this.uiLayer?.remove();
    this.renderer.dispose();
  }
}
