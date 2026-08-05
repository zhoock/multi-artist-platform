/**
 * Group F — Auto-renew PATCH (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { patchSubscriptionAutoRenew } from '../../../subscription-auto-renew-patch';
import { hasPremiumAccess } from '../../../subscription-access';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  expectBillingSnapshot,
  expectInvariantSet,
  expectSubscriptionState,
} from '../../helpers/subscription-e2e-assertions';
import { createE2eContext } from '../../helpers/subscription-e2e-fixtures';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import { loadSubscriptionForUser, seedSubscription } from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'F-ON-001',
    title: 'enable auto-renew',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-ON-002',
    title: 'disable auto-renew',
    priority: 'P0',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-ON-003',
    title: 're-enable auto-renew',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-ON-004',
    title: 'enable blocked without payment method',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-ON-005',
    title: 're-enable after dunning preserves counters',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-ON-006',
    title: 'disable from past_due',
    priority: 'P2',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'F-OFF-007',
    title: 'PATCH 503 when flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['F-ON-001', 'F-ON-002']);
const flagOnDbTest =
  isE2eDatabaseConfigured() && process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED === 'true'
    ? test
    : test.skip;

describe('Group F — Auto-renew PATCH @tier1', () => {
  flagOnDbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('F-ON-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-09-03T00:00:00.000Z');
      await seedSubscription({
        userId: ctx.userId,
        status: 'cancel_at_period_end',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-f-enable',
        nextChargeAt: null,
      });

      const { subscription, billing } = await patchSubscriptionAutoRenew(ctx.userId, true);

      await expectSubscriptionState(
        subscription,
        {
          status: 'active',
          nextChargeAt: expiresAt,
        },
        { context: ctx }
      );

      await expectBillingSnapshot(billing, {
        status: 'active',
        autoRenewEnabled: true,
        hasPremiumAccess: true,
      });

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);
      await expectInvariantSet(
        subscription,
        { violations: [] },
        { context: ctx, now: E2E_TIME_ANCHOR }
      );
    }, E2E_TIME_ANCHOR);
  });

  flagOnDbTest(buildTaggedTestName(SCENARIOS[1]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('F-ON-002', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      const expiresAt = new Date('2026-09-03T00:00:00.000Z');
      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt,
        paymentMethodId: 'pm-f-disable',
        nextChargeAt: expiresAt,
      });

      const { subscription, billing } = await patchSubscriptionAutoRenew(ctx.userId, false);

      await expectSubscriptionState(
        subscription,
        {
          status: 'cancel_at_period_end',
          nextChargeAt: null,
        },
        { context: ctx }
      );

      await expectBillingSnapshot(billing, {
        status: 'cancel_at_period_end',
        autoRenewEnabled: false,
        hasPremiumAccess: true,
      });

      expect(hasPremiumAccess(subscription, E2E_TIME_ANCHOR)).toBe(true);
      await expectInvariantSet(
        subscription,
        { violations: [] },
        { context: ctx, now: E2E_TIME_ANCHOR }
      );
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
