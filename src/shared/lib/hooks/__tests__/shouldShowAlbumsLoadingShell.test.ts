import { describe, expect, test } from '@jest/globals';
import { shouldShowAlbumsLoadingShell } from '../useShowAlbumsLoadingShell';

describe('shouldShowAlbumsLoadingShell (SWR)', () => {
  test('не показывает shell при stale, если уже есть renderable данные', () => {
    expect(shouldShowAlbumsLoadingShell('loading', true, true)).toBe(false);
    expect(shouldShowAlbumsLoadingShell('succeeded', true, true)).toBe(false);
  });

  test('показывает shell при stale только без данных (cold start)', () => {
    expect(shouldShowAlbumsLoadingShell('idle', false, true)).toBe(true);
    expect(shouldShowAlbumsLoadingShell('loading', false, true)).toBe(true);
  });

  test('не показывает shell при loading, если данные уже есть', () => {
    expect(shouldShowAlbumsLoadingShell('loading', true, false)).toBe(false);
  });
});
