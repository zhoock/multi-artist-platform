jest.mock('three', () => {
  const actual = jest.requireActual<typeof import('three')>('three');

  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    setSize = jest.fn();
    setPixelRatio = jest.fn();
    render = jest.fn();
    dispose = jest.fn();

    constructor() {
      this.domElement = document.createElement('canvas');
      Object.defineProperty(this.domElement, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 400,
          right: 800,
          bottom: 400,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      });
    }
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

import * as THREE from 'three';
import { Universe3D } from '../Universe3D';

describe('Universe3D artist activation', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createUniverse(options?: {
    isHeroPreview?: boolean;
    onPlayArtist?: (artist: { publicSlug?: string }) => boolean | Promise<boolean>;
    getArtistCardPlaySnapshot?: () => {
      startingArtistSlug: string | null;
      activeArtistSlug: string | null;
      isPlaying: boolean;
      hasActiveQueue: boolean;
    };
  }) {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    document.body.appendChild(container);

    const universe = new Universe3D(
      container,
      [
        {
          name: 'Beatles',
          publicSlug: 'beatles',
          genreCode: 'rock',
        },
      ],
      {
        disableCameraControls: true,
        embedInContainer: true,
        isHeroPreview: options?.isHeroPreview === true,
        onPlayArtist: options?.onPlayArtist,
        getArtistCardPlaySnapshot: options?.getArtistCardPlaySnapshot,
        artistCardPlayLabels: { play: 'Play', starting: 'Loading…', pause: 'Pause' },
      }
    );

    return { container, universe };
  }

  function mockLabelRaycastHit(universe: Universe3D) {
    const mesh = (universe as unknown as { clickableNodes: THREE.Mesh[] }).clickableNodes[0];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ opacity: 1 }));
    sprite.visible = true;
    mesh.userData.label = sprite;

    let intersectCall = 0;
    jest.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockImplementation(function (
      this: THREE.Raycaster,
      objects: THREE.Object3D[]
    ) {
      intersectCall += 1;
      if (intersectCall === 1) {
        return [];
      }
      if (objects.includes(sprite)) {
        return [
          {
            object: sprite,
            distance: 1,
            point: new THREE.Vector3(),
          } as THREE.Intersection,
        ];
      }
      return [];
    });

    return { mesh, sprite };
  }

  function mockPointRaycastHit(universe: Universe3D) {
    const mesh = (universe as unknown as { clickableNodes: THREE.Mesh[] }).clickableNodes[0];

    jest.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockImplementation(function (
      this: THREE.Raycaster,
      objects: THREE.Object3D[]
    ) {
      if (objects.includes(mesh)) {
        return [
          {
            object: mesh,
            distance: 1,
            point: new THREE.Vector3(),
          } as THREE.Intersection,
        ];
      }
      return [];
    });

    return mesh;
  }

  function tapCanvas(universe: Universe3D, clientX: number, clientY: number) {
    (
      universe as unknown as { performCanvasTouchTap: (x: number, y: number) => void }
    ).performCanvasTouchTap(clientX, clientY);
    jest.advanceTimersByTime(250);
  }

  describe('main Universe3D mode', () => {
    test('activatePrimaryArtist opens artist card', () => {
      const { container, universe } = createUniverse();

      expect(container.querySelector('.universe3d-card')).toBeNull();
      expect(universe.activatePrimaryArtist()).toBe(true);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      universe.destroy();
      container.remove();
    });

    test('click artist label opens same artist card', () => {
      const { container, universe } = createUniverse();
      mockLabelRaycastHit(universe);

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      const event = new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true });
      Object.defineProperty(event, 'target', { value: canvas, configurable: true });

      expect(universe.tryActivateArtistFromClick(event)).toBe(true);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      universe.destroy();
      container.remove();
    });

    test('click artist point opens artist card', () => {
      const { container, universe } = createUniverse();
      mockPointRaycastHit(universe);

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      const event = new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true });
      Object.defineProperty(event, 'target', { value: canvas, configurable: true });

      expect(universe.tryActivateArtistFromClick(event)).toBe(true);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      universe.destroy();
      container.remove();
    });

    test('mobile tap artist label opens same artist card', () => {
      jest.useFakeTimers();
      const { container, universe } = createUniverse();
      mockLabelRaycastHit(universe);

      tapCanvas(universe, 100, 100);

      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      universe.destroy();
      container.remove();
      jest.useRealTimers();
    });

    test('mobile tap artist point opens artist card', () => {
      jest.useFakeTimers();
      const { container, universe } = createUniverse();
      mockPointRaycastHit(universe);

      tapCanvas(universe, 100, 100);

      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      universe.destroy();
      container.remove();
      jest.useRealTimers();
    });

    function appendMiniPlayerPauseButton(): HTMLButtonElement {
      const mini = document.createElement('div');
      mini.className = 'mini-player';
      const pause = document.createElement('button');
      pause.type = 'button';
      pause.className = 'mini-player__control';
      pause.textContent = 'Pause';
      mini.appendChild(pause);
      document.body.appendChild(mini);
      return pause;
    }

    function dispatchWindowBubbledClick(target: HTMLElement, clientX = 400, clientY = 720) {
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })
      );
    }

    test('mini-player pause click does not dismiss open artist card', () => {
      const { container, universe } = createUniverse();
      const pauseButton = appendMiniPlayerPauseButton();

      expect(universe.activatePrimaryArtist()).toBe(true);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      dispatchWindowBubbledClick(pauseButton);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      pauseButton.closest('.mini-player')?.remove();
      universe.destroy();
      container.remove();
    });

    test('mini-player play click does not dismiss open artist card', () => {
      const { container, universe } = createUniverse({
        getArtistCardPlaySnapshot: () => ({
          startingArtistSlug: null,
          activeArtistSlug: 'beatles',
          isPlaying: false,
          hasActiveQueue: true,
        }),
      });
      const playButton = appendMiniPlayerPauseButton();
      playButton.textContent = 'Play';

      universe.activatePrimaryArtist();
      universe.syncArtistCardPlayButtonState();
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      dispatchWindowBubbledClick(playButton);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      playButton.closest('.mini-player')?.remove();
      universe.destroy();
      container.remove();
    });

    test('player snapshot sync (pause / auto-advance) keeps card open and updates button', () => {
      let isPlaying = true;
      const { container, universe } = createUniverse({
        getArtistCardPlaySnapshot: () => ({
          startingArtistSlug: null,
          activeArtistSlug: 'beatles',
          isPlaying,
          hasActiveQueue: true,
        }),
      });

      universe.activatePrimaryArtist();
      universe.syncArtistCardPlayButtonState();
      const cardPlay = container.querySelector('.universe3d-card__play') as HTMLButtonElement;
      expect(cardPlay.dataset.playPhase).toBe('pause');

      isPlaying = false;
      universe.syncArtistCardPlayButtonState();
      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(cardPlay.dataset.playPhase).toBe('play');

      isPlaying = true;
      universe.syncArtistCardPlayButtonState();
      expect(container.querySelector('.universe3d-card')).not.toBeNull();
      expect(cardPlay.dataset.playPhase).toBe('pause');

      universe.destroy();
      container.remove();
    });

    test('click same artist node still dismisses card (manual close)', () => {
      const { container, universe } = createUniverse();
      mockPointRaycastHit(universe);

      universe.activatePrimaryArtist();
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
      const event = new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true });
      Object.defineProperty(event, 'target', { value: canvas, configurable: true });
      window.dispatchEvent(event);

      expect(container.querySelector('.universe3d-card')).toBeNull();

      universe.destroy();
      container.remove();
    });

    test('sync shows Pause when player reports same artist playing', () => {
      const { container, universe } = createUniverse({
        getArtistCardPlaySnapshot: () => ({
          startingArtistSlug: null,
          activeArtistSlug: 'beatles',
          isPlaying: true,
          hasActiveQueue: true,
        }),
      });

      universe.activatePrimaryArtist();
      universe.syncArtistCardPlayButtonState();
      const playButton = container.querySelector('.universe3d-card__play') as HTMLButtonElement;
      expect(playButton.textContent).toBe('Pause');
      expect(playButton.dataset.playPhase).toBe('pause');

      universe.destroy();
      container.remove();
    });

    test('successful Artist Play keeps artist card open', async () => {
      const onPlayArtist = jest.fn(async () => true);
      const { container, universe } = createUniverse({ onPlayArtist });

      expect(universe.activatePrimaryArtist()).toBe(true);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      const playButton = container.querySelector('.universe3d-card__play') as HTMLButtonElement;
      playButton.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(onPlayArtist).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      universe.destroy();
      container.remove();
    });

    test('Escape still dismisses artist card after successful play', async () => {
      const onPlayArtist = jest.fn(async () => true);
      const { container, universe } = createUniverse({ onPlayArtist });

      universe.activatePrimaryArtist();
      const playButton = container.querySelector('.universe3d-card__play') as HTMLButtonElement;
      playButton.click();
      await Promise.resolve();

      expect(container.querySelector('.universe3d-card')).not.toBeNull();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(container.querySelector('.universe3d-card')).toBeNull();

      universe.destroy();
      container.remove();
    });

    test('selecting another artist replaces the open card', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
      document.body.appendChild(container);

      const universe = new Universe3D(
        container,
        [
          { name: 'Beatles', publicSlug: 'beatles', genreCode: 'rock' },
          { name: 'Stones', publicSlug: 'stones', genreCode: 'rock' },
        ],
        { disableCameraControls: true, embedInContainer: true }
      );

      const nodes = (universe as unknown as { clickableNodes: THREE.Object3D[] }).clickableNodes;
      expect(nodes.length).toBe(2);

      (
        universe as unknown as { handleArtistNodeActivation: (o: THREE.Object3D) => void }
      ).handleArtistNodeActivation(nodes[0]);
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Beatles');

      (
        universe as unknown as { handleArtistNodeActivation: (o: THREE.Object3D) => void }
      ).handleArtistNodeActivation(nodes[1]);
      expect(container.querySelectorAll('.universe3d-card')).toHaveLength(1);
      expect(container.querySelector('.universe3d-card__title')?.textContent).toBe('Stones');

      universe.destroy();
      container.remove();
    });

    test('play button shows starting state and ignores duplicate click until settled', async () => {
      let resolvePlay!: (value: boolean) => void;
      const onPlayArtist = jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePlay = resolve;
          })
      );
      const { container, universe } = createUniverse({ onPlayArtist });

      expect(universe.activatePrimaryArtist()).toBe(true);
      const playButton = container.querySelector('.universe3d-card__play') as HTMLButtonElement;
      expect(playButton).toBeTruthy();

      playButton.click();
      expect(onPlayArtist).toHaveBeenCalledTimes(1);
      expect(playButton.disabled).toBe(true);
      expect(playButton.dataset.playStarting).toBe('1');

      playButton.click();
      expect(onPlayArtist).toHaveBeenCalledTimes(1);

      resolvePlay(false);
      await Promise.resolve();
      await Promise.resolve();

      expect(playButton.disabled).toBe(false);
      expect(playButton.dataset.playStarting).toBeUndefined();

      universe.destroy();
      container.remove();
    });

    test('hovering artist name uses same pointer cursor as artist dot', () => {
      const { container, universe } = createUniverse();
      mockLabelRaycastHit(universe);

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      canvas?.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true })
      );

      expect(canvas?.style.cursor).toBe('pointer');

      universe.destroy();
      container.remove();
    });
  });

  describe('hero preview mode', () => {
    test('activatePrimaryArtist does not open artist card', () => {
      const { container, universe } = createUniverse({ isHeroPreview: true });

      expect(universe.activatePrimaryArtist()).toBe(false);
      expect(container.querySelector('.universe3d-card')).toBeNull();

      universe.destroy();
      container.remove();
    });

    test('tryActivateArtistFromClick does not open artist card', () => {
      const { container, universe } = createUniverse({ isHeroPreview: true });
      mockLabelRaycastHit(universe);

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      const event = new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true });
      Object.defineProperty(event, 'target', { value: canvas, configurable: true });

      expect(universe.tryActivateArtistFromClick(event)).toBe(false);
      expect(container.querySelector('.universe3d-card')).toBeNull();

      universe.destroy();
      container.remove();
    });

    test('hovering artist point does not set canvas pointer cursor', () => {
      const { container, universe } = createUniverse({ isHeroPreview: true });
      mockPointRaycastHit(universe);

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      canvas?.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true })
      );

      expect(canvas?.style.cursor).not.toBe('pointer');

      universe.destroy();
      container.remove();
    });
  });
});
