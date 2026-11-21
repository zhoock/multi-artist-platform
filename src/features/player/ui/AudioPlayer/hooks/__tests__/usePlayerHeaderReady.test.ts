import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlayerHeaderReady } from '../usePlayerHeaderReady';

describe('usePlayerHeaderReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns ready when disabled', () => {
    const { result } = renderHook(() =>
      usePlayerHeaderReady({
        enabled: false,
        coverKey: 'cover.webp',
        trackTitle: 'Track',
        albumTitle: 'Album',
        artistLabel: 'Artist',
      })
    );

    expect(result.current.isHeaderReady).toBe(true);
  });

  test('waits for cached cover and metadata in fullscreen', async () => {
    const container = document.createElement('div');
    const img = document.createElement('img');
    img.className = 'album-cover__image';
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 120 });
    container.appendChild(img);

    const { result } = renderHook(() =>
      usePlayerHeaderReady({
        enabled: true,
        coverKey: 'cover.webp',
        trackTitle: 'Track',
        albumTitle: 'Album',
        artistLabel: 'Artist',
      })
    );

    expect(result.current.isHeaderReady).toBe(false);

    act(() => {
      result.current.setCoverContainer(container);
    });

    await waitFor(() => {
      expect(result.current.isHeaderReady).toBe(true);
    });
  });

  test('marks ready on cover error', async () => {
    const container = document.createElement('div');
    const img = document.createElement('img');
    img.className = 'album-cover__image';
    Object.defineProperty(img, 'complete', { value: false });
    Object.defineProperty(img, 'naturalWidth', { value: 0 });
    container.appendChild(img);

    const { result } = renderHook(() =>
      usePlayerHeaderReady({
        enabled: true,
        coverKey: 'missing.webp',
        trackTitle: 'Track',
        albumTitle: 'Album',
        artistLabel: 'Artist',
      })
    );

    act(() => {
      result.current.setCoverContainer(container);
    });

    act(() => {
      img.dispatchEvent(new Event('error'));
    });

    await waitFor(() => {
      expect(result.current.isHeaderReady).toBe(true);
    });
  });
});
