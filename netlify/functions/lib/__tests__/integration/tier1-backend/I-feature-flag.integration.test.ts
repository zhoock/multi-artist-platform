/**
 * Group I — Feature flag (tier1-backend)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group I
 * Scenarios:
 *   I-OFF (suite) @p1 — Flag OFF cross-cutting suite
 *   I-ON  (suite) @p1 — Flag ON cross-cutting suite
 *   I-001 @p1 — Seed autorenew columns with flag OFF
 *   I-002 @p2 — Toggle flag ON mid-process
 *   I-003 @p2 — Toggle flag OFF after ON data
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier1BackendHooks } from '../../helpers/subscription-e2e-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'I-OFF',
    title: 'flag OFF cross-cutting suite',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
  {
    id: 'I-ON',
    title: 'flag ON cross-cutting suite',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'I-001',
    title: 'autorenew columns inert when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
  {
    id: 'I-002',
    title: 'toggle flag ON mid-process',
    priority: 'P2',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'I-003',
    title: 'toggle flag OFF after ON data',
    priority: 'P2',
    flags: ['both'],
    tier: 'tier1-backend',
  },
];

describe('Group I — Feature flag @tier1', () => {
  registerScenarioTodos(SCENARIOS);
});
