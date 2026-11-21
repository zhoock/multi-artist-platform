import { describe, expect, test } from '@jest/globals';

import { getMiniPlayerContextMenuLabels } from '../miniPlayerContextMenuLabels';

describe('getMiniPlayerContextMenuLabels', () => {
  test('falls back to Russian defaults', () => {
    expect(getMiniPlayerContextMenuLabels('ru', null).hideMiniPlayer).toBe('Скрыть мини-плеер');
  });

  test('reads ui dictionary overrides', () => {
    const labels = getMiniPlayerContextMenuLabels('en', {
      player: {
        contextMenu: { hideMiniPlayer: 'Dismiss mini player' },
      },
    } as never);
    expect(labels.hideMiniPlayer).toBe('Dismiss mini player');
    expect(labels.goToAlbum).toBe('Go to album');
  });
});
