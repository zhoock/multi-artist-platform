/**
 * Group J — Database invariants (tier1-backend)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group J
 * Scenarios:
 *   J-001 @p1 — Healthy active + PM → no violations
 *   J-002 @p2 @known-gap-I2 — Post resubscribe+PM → I2 violation
 *   J-003 @p2 — After backfill 069 → no violations
 *   J-004 @p1 — cancel_at_period_end → no I3
 *   J-005 @p1 — expired → no I4
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier1BackendHooks } from '../../helpers/subscription-e2e-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'J-001',
    title: 'healthy active subscription invariants',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'J-002',
    title: 'I2 violation after resubscribe with existing PM',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
    knownGaps: ['I2'],
  },
  {
    id: 'J-003',
    title: 'invariants pass after backfill 069',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'J-004',
    title: 'cancel_at_period_end satisfies I3',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'J-005',
    title: 'expired satisfies I4',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
];

describe('Group J — Database invariants @tier1', () => {
  registerScenarioTodos(SCENARIOS);
});
