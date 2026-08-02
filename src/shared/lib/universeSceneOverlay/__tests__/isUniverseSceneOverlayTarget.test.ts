import { UNIVERSE_SCENE_OVERLAY_ATTR } from '../constants';
import { isUniverseSceneOverlayTarget } from '../isUniverseSceneOverlayTarget';

describe('isUniverseSceneOverlayTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns false for null and non-element targets', () => {
    expect(isUniverseSceneOverlayTarget(null)).toBe(false);
    expect(isUniverseSceneOverlayTarget(document.createTextNode('x'))).toBe(false);
  });

  it('returns true for marked overlay roots and descendants', () => {
    document.body.innerHTML = `
      <section ${UNIVERSE_SCENE_OVERLAY_ATTR}>
        <p id="text">Select me</p>
        <button id="btn" type="button">OK</button>
      </section>
    `;

    expect(isUniverseSceneOverlayTarget(document.getElementById('text'))).toBe(true);
    expect(isUniverseSceneOverlayTarget(document.getElementById('btn'))).toBe(true);
  });

  it('returns true for in-scene artist cards', () => {
    document.body.innerHTML = `
      <article class="universe3d-card">
        <a id="link" href="#">Artist</a>
      </article>
    `;

    expect(isUniverseSceneOverlayTarget(document.getElementById('link'))).toBe(true);
  });

  it('returns true for open popup dialogs', () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'popup';
    dialog.open = true;
    dialog.innerHTML = '<input id="field" />';
    document.body.appendChild(dialog);

    expect(isUniverseSceneOverlayTarget(document.getElementById('field'))).toBe(true);
  });

  it('returns false for canvas and plain page chrome', () => {
    document.body.innerHTML = `
      <canvas id="canvas"></canvas>
      <main id="main"><p>content</p></main>
    `;

    expect(isUniverseSceneOverlayTarget(document.getElementById('canvas'))).toBe(false);
    expect(isUniverseSceneOverlayTarget(document.querySelector('main p'))).toBe(false);
  });
});
