import { expect } from '@jest/globals';
import { waitFor } from '@testing-library/react';

import { NOINDEX_ROBOTS_META_CONTENT } from '../noindexRobotsMeta';

export function readRenderedRobotsContent(): string | null {
  return document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
}

export async function expectNoindexRobotsMeta(): Promise<void> {
  await waitFor(() => {
    expect(readRenderedRobotsContent()).toBe(NOINDEX_ROBOTS_META_CONTENT);
  });
}

export async function expectNoRobotsMeta(): Promise<void> {
  await waitFor(() => {
    expect(readRenderedRobotsContent()).toBeNull();
  });
}
