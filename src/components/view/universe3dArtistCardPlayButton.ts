import type { ArtistCardPlayButtonPhase } from '@features/universe/lib/artistCardPlayButtonPhase';

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
    button.dataset.playStarting = '1';
    button.classList.add('universe3d-card__play--starting');
    button.textContent = labels.starting;
    button.dataset.playPhase = 'starting';
    return;
  }

  button.disabled = false;
  if (phase === 'pause') {
    button.textContent = labels.pause;
    button.dataset.playPhase = 'pause';
    return;
  }

  button.textContent = labels.play;
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
