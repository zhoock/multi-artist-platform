/**
 * Group N — Plan identity split (tier2-ui)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group N
 * Audit issue I1: billing.plan vs resolveCurrentPlanSlug heuristic
 * Scenarios:
 *   N-001 @p2 — Consistent plan when DB row matches slots
 *   N-002 @p2 — Document divergence when slotsLimit mismatches plan slug
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier2UiHooks } from '../../helpers/subscription-e2e-ui-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier2UiHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'N-001',
    title: 'billing.plan matches resolveCurrentPlanSlug',
    priority: 'P2',
    tier: 'tier2-ui',
  },
  {
    id: 'N-002',
    title: 'plan slug divergence when slots mismatch',
    priority: 'P2',
    tier: 'tier2-ui',
  },
];

describe('Group N — Plan identity split @tier2', () => {
  registerScenarioTodos(SCENARIOS);
});
