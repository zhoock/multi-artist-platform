import type { AlbumsState } from '../types';

/** Минимальный `albums` slice для unit/integration тестов. */
export function createAlbumsTestState(overrides: Partial<AlbumsState> = {}): AlbumsState {
  return {
    dashboard: {
      status: 'idle',
      error: null,
      data: [],
      lastUpdated: null,
      inFlightFetchContextKey: null,
    },
    ...overrides,
  };
}
