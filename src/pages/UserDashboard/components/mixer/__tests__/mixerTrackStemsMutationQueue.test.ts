import { describe, expect, it, jest } from '@jest/globals';
import { createTrackStemsMutationQueue } from '../mixerTrackStemsMutationQueue';

describe('createTrackStemsMutationQueue', () => {
  it('serializes mutations for the same track', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const run = createTrackStemsMutationQueue();

    const first = run('album:track', async () => {
      order.push('start-1');
      await gate;
      order.push('end-1');
    });

    const second = run('album:track', async () => {
      order.push('start-2');
      order.push('end-2');
    });

    await Promise.resolve();
    expect(order).toEqual(['start-1']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('does not block mutations for different tracks', async () => {
    const run = createTrackStemsMutationQueue();
    const fn = jest.fn(async () => undefined);

    await Promise.all([run('album:track-a', fn), run('album:track-b', fn)]);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
