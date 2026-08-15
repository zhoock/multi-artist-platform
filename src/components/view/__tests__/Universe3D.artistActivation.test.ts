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
    jest.restoreAllMocks();
  });

  function createUniverse(options?: { isHeroPreview?: boolean }) {
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
  });
});
