/**
 * Lightweight active-scenario context (no database imports — safe for tier2 jsdom).
 */

import type { E2eTestContext } from './subscription-e2e-fixtures';

let activeContext: E2eTestContext | null = null;

export function setActiveE2eContext(ctx: E2eTestContext | null): void {
  activeContext = ctx;
}

export function getActiveE2eContext(): E2eTestContext | null {
  return activeContext;
}
