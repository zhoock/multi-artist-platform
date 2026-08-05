/**
 * Group O — Webhook + poll smoke (tier3-smoke)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Tier 3 (O)
 * Cross-layer races — reuses scenario IDs from tier1:
 *   A-BOTH-003 @p1 — Webhook + polling race (initial checkout)
 *   C-ON-005   @p1 — Webhook replay upgrade
 *   G-ON-003   @p1 — Duplicate rebind callback
 *   G-ON-004   @p2 — Rebind while renewal pending (M-1)
 *
 * Retry policy: 0 (race tests must not retry)
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier3SmokeHooks } from '../../helpers/subscription-e2e-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier3SmokeHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'A-BOTH-003',
    title: 'smoke webhook + polling race initial checkout',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier3-smoke',
  },
  {
    id: 'C-ON-005',
    title: 'smoke webhook replay upgrade',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier3-smoke',
  },
  {
    id: 'G-ON-003',
    title: 'smoke duplicate rebind callback',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier3-smoke',
  },
  {
    id: 'G-ON-004',
    title: 'smoke rebind while renewal pending',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier3-smoke',
  },
];

describe('Group O — Webhook poll smoke @tier3', () => {
  registerScenarioTodos(SCENARIOS);
});
