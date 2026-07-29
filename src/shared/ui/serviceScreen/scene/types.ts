/** Visual scene identity — no page semantics, reusable across routes. */
export type ServiceSceneId =
  | 'broken-link'
  | 'constellation-birth'
  | 'constellation-lost'
  | 'envelope'
  | '404'
  | 'sphere'
  | 'rings'
  | 'hexagon';

/** Lifecycle handle returned by every renderer factory (WebGL, Canvas, SVG, DOM, …). */
export interface ServiceRendererHandle {
  mount(container: HTMLElement): void;
  unmount(): void;
  setSize(width: number, height: number): void;
}

export type ServiceRendererFactory = () => ServiceRendererHandle;

export type ServiceSceneDefinition = {
  id: ServiceSceneId;
  createRenderer: ServiceRendererFactory;
};
