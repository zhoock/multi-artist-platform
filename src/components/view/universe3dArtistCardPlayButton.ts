import type { ArtistCardPlayButtonPhase } from '@features/universe/lib/artistCardPlayButtonPhase';

import {
  universe3dArtistCardPauseIconMarkup,
  universe3dArtistCardPlayIconMarkup,
} from './universe3dArtistCardPlayButtonIcons';

export type Universe3dArtistCardPlayLabels = {
  play: string;
  starting: string;
  pause: string;
};

export const DEFAULT_UNIVERSE3D_ARTIST_CARD_PLAY_LABELS: Universe3dArtistCardPlayLabels = {
  play: 'Play',
  starting: 'Loading…',
  pause: 'Pause',
};

function ensureUniverse3dCardPlayGlyph(button: HTMLButtonElement): HTMLElement {
  const existing = button.querySelector('.universe3d-card__play-glyph');
  if (existing instanceof HTMLElement) {
    return existing;
  }

  button.replaceChildren();
  const glyph = document.createElement('span');
  glyph.className = 'universe3d-card__play-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  button.appendChild(glyph);
  return glyph;
}

function setUniverse3dCardPlayGlyphMarkup(button: HTMLButtonElement, markup: string): void {
  const glyph = ensureUniverse3dCardPlayGlyph(button);
  glyph.innerHTML = markup;
}

export function applyUniverse3dCardPlayButtonState(
  button: HTMLButtonElement,
  input: { phase: ArtistCardPlayButtonPhase; labels: Universe3dArtistCardPlayLabels }
): void {
  const { phase, labels } = input;
  button.classList.remove('universe3d-card__play--starting');
  delete button.dataset.playStarting;
  button.removeAttribute('aria-busy');

  if (phase === 'starting') {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-label', labels.starting);
    button.dataset.playStarting = '1';
    button.classList.add('universe3d-card__play--starting');
    setUniverse3dCardPlayGlyphMarkup(button, universe3dArtistCardPlayIconMarkup());
    button.dataset.playPhase = 'starting';
    return;
  }

  button.disabled = false;
  if (phase === 'pause') {
    button.setAttribute('aria-label', labels.pause);
    setUniverse3dCardPlayGlyphMarkup(button, universe3dArtistCardPauseIconMarkup());
    button.dataset.playPhase = 'pause';
    return;
  }

  button.setAttribute('aria-label', labels.play);
  setUniverse3dCardPlayGlyphMarkup(button, universe3dArtistCardPlayIconMarkup());
  button.dataset.playPhase = 'play';
}

export function isUniverse3dCardPlayButtonStarting(button: HTMLButtonElement): boolean {
  return button.dataset.playStarting === '1';
}

export function syncUniverse3dCardPlayButtonForSlug(
  card: HTMLElement,
  phase: ArtistCardPlayButtonPhase,
  labels: Universe3dArtistCardPlayLabels
): void {
  const playButton = card.querySelector('.universe3d-card__play');
  if (!(playButton instanceof HTMLButtonElement)) return;
  applyUniverse3dCardPlayButtonState(playButton, { phase, labels });
}
