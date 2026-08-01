import { describe, expect, it, jest } from '@jest/globals';
import type { StemMeta } from '@entities/stem';
import { createStemsPersistQueue } from '../mixerTrackStemsPersistQueue';

const stem = (id: string): StemMeta => ({
  id,
  name: id,
  category: 'drums',
  file: `${id}.wav`,
});

describe('createStemsPersistQueue', () => {
  it('serializes saves for the same track', async () => {
    const order: number[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const save = jest.fn(async (_albumId: string, _trackId: string, stems: StemMeta[]) => {
      if (order.length === 0) {
        await gate;
      }
      order.push(stems.length);
    });

    const schedule = createStemsPersistQueue(save);
    let snapshot: StemMeta[] = [stem('a')];

    const first = schedule('album', 'track', () => snapshot);
    snapshot = [stem('a'), stem('b')];
    const second = schedule('album', 'track', () => snapshot);

    releaseFirst();
    await Promise.all([first, second]);

    expect(save).toHaveBeenCalledTimes(2);
    expect(order).toEqual([2, 2]);
  });

  it('uses the latest snapshot when a flush runs after a newer schedule', async () => {
    const saved: string[][] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const save = jest.fn(async (_albumId: string, _trackId: string, stems: StemMeta[]) => {
      if (saved.length === 0) {
        await gate;
      }
      saved.push(stems.map((entry) => entry.id));
    });

    const schedule = createStemsPersistQueue(save);
    let snapshot: StemMeta[] = [stem('only')];

    const first = schedule('album', 'track', () => snapshot);
    snapshot = [stem('only'), stem('new')];
    const second = schedule('album', 'track', () => snapshot);

    releaseFirst();
    await Promise.all([first, second]);

    expect(saved).toEqual([
      ['only', 'new'],
      ['only', 'new'],
    ]);
  });

  it('does not block saves for different tracks', async () => {
    const save = jest.fn(async () => undefined);
    const schedule = createStemsPersistQueue(save);

    await Promise.all([
      schedule('album', 'track-a', () => [stem('1')]),
      schedule('album', 'track-b', () => [stem('2')]),
    ]);

    expect(save).toHaveBeenCalledTimes(2);
  });
});
