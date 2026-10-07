import { describe, expect, jest, test } from '@jest/globals';

import { runHomeArtistPlayClick } from '../runHomeArtistPlayClick';

describe('runHomeArtistPlayClick', () => {
  test('first click sets starting slug and runs playback', async () => {
    let starting: string | null = null;
    let inflight: Promise<boolean> | null = null;
    const startPlayback = jest.fn(async () => ({ ok: true }));
    const onSuccess = jest.fn();

    const result = await runHomeArtistPlayClick({
      publicSlug: 'demo-artist',
      getInflight: () => inflight,
      setInflight: (p) => {
        inflight = p;
      },
      setStartingSlug: (slug) => {
        starting = slug;
      },
      startPlayback,
      onSuccess,
    });

    expect(result).toBe(true);
    expect(starting).toBe('demo-artist');
    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(inflight).toBeNull();
  });

  test('second click while inflight reuses promise and does not restart playback', async () => {
    let inflight: Promise<boolean> | null = null;
    let resolvePlayback!: (ok: boolean) => void;
    const startPlayback = jest.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolvePlayback = (ok) => resolve({ ok });
        })
    );

    const first = runHomeArtistPlayClick({
      publicSlug: 'demo-artist',
      getInflight: () => inflight,
      setInflight: (p) => {
        inflight = p;
      },
      setStartingSlug: () => undefined,
      startPlayback,
      onSuccess: () => undefined,
    });

    const second = runHomeArtistPlayClick({
      publicSlug: 'demo-artist',
      getInflight: () => inflight,
      setInflight: (p) => {
        inflight = p;
      },
      setStartingSlug: () => undefined,
      startPlayback,
      onSuccess: () => undefined,
    });

    expect(startPlayback).toHaveBeenCalledTimes(1);
    resolvePlayback(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  test('failed playback clears starting slug', async () => {
    let starting: string | null = 'demo-artist';
    const startPlayback = jest.fn(async () => ({ ok: false }));

    const result = await runHomeArtistPlayClick({
      publicSlug: 'demo-artist',
      getInflight: () => null,
      setInflight: () => undefined,
      setStartingSlug: (slug) => {
        starting = slug;
      },
      startPlayback,
      onSuccess: () => undefined,
    });

    expect(result).toBe(false);
    expect(starting).toBeNull();
  });

  test('playback error clears starting slug', async () => {
    let starting: string | null = 'demo-artist';
    const startPlayback = jest.fn(async () => {
      throw new Error('network');
    });

    const result = await runHomeArtistPlayClick({
      publicSlug: 'demo-artist',
      getInflight: () => null,
      setInflight: () => undefined,
      setStartingSlug: (slug) => {
        starting = slug;
      },
      startPlayback,
      onSuccess: () => undefined,
    });

    expect(result).toBe(false);
    expect(starting).toBeNull();
  });
});
