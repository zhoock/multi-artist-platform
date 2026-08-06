/**
 * Group M — Banners & modals (tier2-ui)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group M
 * Scenarios:
 *   M-001 @p1 — Cancelled banner + resume CTA
 *   M-002 @p1 — Expired banner + renew CTA
 *   M-003 @p1 — Payment failed banner + rebind CTA
 *   M-004 @p1 — Disable auto-renew link (ACTIVE)
 *   M-005 @p1 — ACTIVE next charge in plan card
 *   M-006 @p1 — Downgrade slots overlay
 *   M-007 @p1 — DisableAutoRenewModal
 *   M-008 @p1 — EnableAutoRenewModal
 *   M-009 @p1 — RebindPaymentMethodModal
 *   M-010 @p2 — UpgradePlanConfirmModal
 */

import { describe } from '@jest/globals';

import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import { registerTier2UiHooks } from '../../helpers/subscription-e2e-ui-setup';
import type { E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';

registerTier2UiHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  { id: 'M-001', title: 'cancelled banner and resume CTA', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-002', title: 'expired banner and renew CTA', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-003', title: 'payment failed banner and rebind CTA', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-004', title: 'disable auto-renew link on ACTIVE', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-005', title: 'ACTIVE next charge in plan card', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-006', title: 'downgrade slots overlay', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-007', title: 'DisableAutoRenewModal flow', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-008', title: 'EnableAutoRenewModal flow', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-009', title: 'RebindPaymentMethodModal flow', priority: 'P1', tier: 'tier2-ui' },
  { id: 'M-010', title: 'UpgradePlanConfirmModal flow', priority: 'P2', tier: 'tier2-ui' },
];

describe('Group M — Banners and modals @tier2', () => {
  registerScenarioTodos(SCENARIOS);
});
