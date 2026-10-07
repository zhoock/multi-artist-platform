import { describe, expect, test } from '@jest/globals';

import {
  applyUniverse3dCardPlayButtonState,
  isUniverse3dCardPlayButtonStarting,
  syncUniverse3dCardPlayButtonForSlug,
} from '../universe3dArtistCardPlayButton';

const labels = { play: 'Play', starting: 'Loading…', pause: 'Pause' };

describe('universe3dArtistCardPlayButton', () => {
  test('starting disables button and shows loading label', () => {
    const button = document.createElement('button');
    applyUniverse3dCardPlayButtonState(button, { phase: 'starting', labels });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Loading…');
    expect(isUniverse3dCardPlayButtonStarting(button)).toBe(true);
  });

  test('pause shows pause label and stays enabled', () => {
    const button = document.createElement('button');
    applyUniverse3dCardPlayButtonState(button, { phase: 'pause', labels });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Pause');
    expect(button.dataset.playPhase).toBe('pause');
  });

  test('play idle restores play label', () => {
    const button = document.createElement('button');
    applyUniverse3dCardPlayButtonState(button, { phase: 'starting', labels });
    applyUniverse3dCardPlayButtonState(button, { phase: 'play', labels });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Play');
  });

  test('sync applies phase on card button', () => {
    const card = document.createElement('div');
    card.dataset.artistSlug = 'artist-a';
    card.innerHTML = '<button type="button" class="universe3d-card__play">Play</button>';
    syncUniverse3dCardPlayButtonForSlug(card, 'pause', labels);
    const button = card.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Pause');
  });
});
