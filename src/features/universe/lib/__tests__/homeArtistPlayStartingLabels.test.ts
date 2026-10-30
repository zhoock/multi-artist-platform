import { describe, expect, test } from '@jest/globals';

import { resolveHomeArtistCardPlayLabels } from '../homeArtistPlayStartingLabels';

describe('resolveHomeArtistCardPlayLabels', () => {
  test('capitalizes pause label to match play button style', () => {
    expect(
      resolveHomeArtistCardPlayLabels('ru', {
        buttons: { playButton: 'Воспроизвести', pause: 'пауза' },
      } as never)
    ).toMatchObject({ play: 'Воспроизвести', pause: 'Пауза' });

    expect(
      resolveHomeArtistCardPlayLabels('en', {
        buttons: { playButton: 'Play', pause: 'pause' },
      } as never)
    ).toMatchObject({ play: 'Play', pause: 'Pause' });
  });
});
