import { describe, expect, test } from '@jest/globals';

import { getPlayerA11yLabels } from '../getPlayerA11yLabels';
import type { IInterface } from '@models';

describe('getPlayerA11yLabels', () => {
  test('uses language-specific fallbacks when dictionary is missing', () => {
    expect(getPlayerA11yLabels('ru', null).play).toBe('Воспроизвести');
    expect(getPlayerA11yLabels('en', null).play).toBe('Play');
    expect(getPlayerA11yLabels('en', null).closePlayer).toBe('Close player');
  });

  test('prefers uiDictionary player keys when present', () => {
    const ui = {
      player: {
        previousTrack: 'Prev custom',
        play: 'Play custom',
        pause: 'Pause custom',
        nextTrack: 'Next custom',
        openFullPlayer: 'Open custom',
        closePlayer: 'Close custom',
      },
    } as IInterface;

    const labels = getPlayerA11yLabels('en', ui);
    expect(labels.play).toBe('Play custom');
    expect(labels.closePlayer).toBe('Close custom');
  });

  test('falls back per-key when dictionary entry is empty', () => {
    const ui = {
      player: {
        previousTrack: '',
        play: ' ',
        pause: 'Pause custom',
        nextTrack: 'Next custom',
        openFullPlayer: 'Open custom',
        closePlayer: 'Close custom',
      },
    } as IInterface;

    expect(getPlayerA11yLabels('en', ui).play).toBe('Play');
    expect(getPlayerA11yLabels('en', ui).pause).toBe('Pause custom');
  });
});
