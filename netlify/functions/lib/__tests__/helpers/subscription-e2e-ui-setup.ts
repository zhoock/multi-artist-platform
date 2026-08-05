/**
 * PR-10 tier2 UI common setup (mocked API — no database).
 */

import { afterEach, beforeEach } from '@jest/globals';

import { setActiveE2eContext } from './subscription-e2e-context';

export function registerTier2UiHooks(): void {
  beforeEach(() => {
    setActiveE2eContext(null);
  });

  afterEach(() => {
    setActiveE2eContext(null);
  });
}
