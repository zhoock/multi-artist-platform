/**
 * PR-10 frozen-time helpers for grace, pre-billing, and renewal retry scenarios.
 * @see docs/adr/pr-10-e2e-specification.md
 */

import { jest } from '@jest/globals';

/** Default anchor — align with spec examples (2026-08-05T12:00:00.000Z). */
export const E2E_TIME_ANCHOR = new Date('2026-08-05T12:00:00.000Z');

export type FrozenTimeHandle = {
  restore: () => void;
  advance: (ms: number) => void;
  set: (date: Date) => void;
  now: () => Date;
};

/** Runs fn with jest fake timers anchored at `at` (default E2E_TIME_ANCHOR). */
export async function withFrozenTime<T>(
  fn: (time: FrozenTimeHandle) => Promise<T> | T,
  at: Date = E2E_TIME_ANCHOR
): Promise<T> {
  jest.useFakeTimers({ now: at.getTime(), advanceTimers: true });
  const handle: FrozenTimeHandle = {
    restore: () => {
      jest.useRealTimers();
    },
    advance: (ms: number) => {
      jest.advanceTimersByTime(ms);
    },
    set: (date: Date) => {
      jest.setSystemTime(date);
    },
    now: () => new Date(),
  };

  try {
    return await fn(handle);
  } finally {
    handle.restore();
  }
}

/** Spec time points relative to period end / charge schedule. */
export const E2E_TIME_OFFSETS = {
  preBillingWindowStart: 3 * 24 * 60 * 60 * 1000,
  gracePeriod: 7 * 24 * 60 * 60 * 1000,
  renewalRetry1: 24 * 60 * 60 * 1000,
  renewalRetry2: 72 * 60 * 60 * 1000,
  renewalRetry3: 168 * 60 * 60 * 1000,
} as const;

export function addMs(from: Date, ms: number): Date {
  return new Date(from.getTime() + ms);
}
