import { getServiceScene } from '../registry';
import type { ServiceRendererHandle, ServiceSceneId } from '../types';

export class ServiceSceneEngine {
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private handle: ServiceRendererHandle | null = null;
  private sceneId: ServiceSceneId | undefined;

  attach(container: HTMLElement): void {
    this.container = container;
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(container);

    if (this.sceneId) {
      this.mountScene(this.sceneId);
    }
  }

  setScene(id: ServiceSceneId | undefined): void {
    if (this.sceneId === id) {
      return;
    }

    this.unmountScene();
    this.sceneId = id;

    if (id && this.container) {
      this.mountScene(id);
    }
  }

  detach(): void {
    this.unmountScene();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container = null;
    this.sceneId = undefined;
  }

  private mountScene(id: ServiceSceneId): void {
    if (!this.container) {
      return;
    }

    const definition = getServiceScene(id);
    this.handle = definition.createRenderer();
    this.handle.mount(this.container);
    this.syncSize();
  }

  private unmountScene(): void {
    this.handle?.unmount();
    this.handle = null;
  }

  private syncSize(): void {
    if (!this.container || !this.handle) {
      return;
    }

    this.handle.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}
