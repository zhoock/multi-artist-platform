/**
 * Group L — BillingOverlay (tier2-ui)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group L
 * Scenarios:
 *   L-001 @p1 — ACTIVE pre-billing only
 *   L-002 @p1 — ACTIVE downgrade + pre-billing
 *   L-003 @p1 — ACTIVE schedule without excess slots
 *   L-004 @p1 — CANCELLED downgrade only
 *   L-005 @p1 — PAYMENT_FAILED no overlays
 *   L-006 @p1 — EXPIRED no overlays
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier2UiHooks } from '../../helpers/subscription-e2e-ui-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier2UiHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  { id: 'L-001', title: 'ACTIVE pre-billing overlay only', priority: 'P1', tier: 'tier2-ui' },
  {
    id: 'L-002',
    title: 'ACTIVE downgrade and pre-billing overlays',
    priority: 'P1',
    tier: 'tier2-ui',
  },
  { id: 'L-003', title: 'ACTIVE schedule without excess slots', priority: 'P1', tier: 'tier2-ui' },
  { id: 'L-004', title: 'CANCELLED downgrade overlay only', priority: 'P1', tier: 'tier2-ui' },
  { id: 'L-005', title: 'PAYMENT_FAILED suppresses overlays', priority: 'P1', tier: 'tier2-ui' },
  { id: 'L-006', title: 'EXPIRED suppresses overlays', priority: 'P1', tier: 'tier2-ui' },
];

describe('Group L — BillingOverlay @tier2', () => {
  registerScenarioTodos(SCENARIOS);
});
