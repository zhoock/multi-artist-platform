/**
 * Group H — Entitlement gates (tier1-backend)
 */

import { describe, expect, test } from '@jest/globals';

import { query } from '../../../db';
import {
  addArtistToArchive,
  ArchiveSubscriptionRequiredError,
  getMyArchiveForUser,
} from '../../../archive';
import { viewerHasPremiumAccessToArtist } from '../../../entitlements';
import { hasPremiumAccess } from '../../../subscription-access';
import { setActiveE2eContext } from '../../helpers/subscription-e2e-context';
import {
  buildSnapshotFromSubscription,
  expectBillingSnapshot,
  expectInvariantSet,
} from '../../helpers/subscription-e2e-assertions';
import {
  createE2eContext,
  TEST_USER_ARTIST_A,
  TEST_USER_SUBSCRIBER,
} from '../../helpers/subscription-e2e-fixtures';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  isE2eDatabaseConfigured,
  registerTier1BackendHooks,
} from '../../helpers/subscription-e2e-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import { seedSubscription, seedTestUser } from '../../helpers/subscription-e2e-seed';

registerTier1BackendHooks();

const SCENARIOS: E2eScenarioMeta[] = [
  {
    id: 'H-BOTH-001',
    title: 'collection add entitlement gate',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-BOTH-002',
    title: 'archive status isPremium parity',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-BOTH-003',
    title: 'premium track lock',
    priority: 'P0',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-BOTH-004',
    title: 'premium article paywall',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-BOTH-005',
    title: 'stems mixer gate',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-BOTH-006',
    title: 'download track gate',
    priority: 'P1',
    flags: ['both'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-ON-007',
    title: 'cancel_at_period_end access flag ON',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-ON-008',
    title: 'past_due grace access flag ON',
    priority: 'P1',
    flags: ['on'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-OFF-009',
    title: 'cancel_at_period_end denied flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
  {
    id: 'H-OFF-010',
    title: 'past_due denied flag OFF',
    priority: 'P1',
    flags: ['off'],
    tier: 'tier1-backend',
  },
];

const P0_IDS = new Set(['H-BOTH-001', 'H-BOTH-002', 'H-BOTH-003']);
const dbTest = isE2eDatabaseConfigured() ? test : test.skip;

function invariantOpts(ctx: ReturnType<typeof createE2eContext>) {
  return {
    context: ctx,
    now: ctx.frozenNow,
    allowKnownGaps: ctx.flagAutoRenew ? [] : ['I2'],
  };
}

describe('Group H — Entitlement gates @tier1', () => {
  dbTest(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('H-BOTH-001', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedTestUser(TEST_USER_ARTIST_A, 'artist-a@pr10-e2e.test');

      await expect(addArtistToArchive(ctx.userId, TEST_USER_ARTIST_A)).rejects.toBeInstanceOf(
        ArchiveSubscriptionRequiredError
      );

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: ctx.flagAutoRenew ? 'pm-h-gate' : null,
        nextChargeAt: ctx.flagAutoRenew ? new Date('2026-09-03T00:00:00.000Z') : null,
      });

      const entry = await addArtistToArchive(ctx.userId, TEST_USER_ARTIST_A);
      expect(entry.isActive).toBe(true);
      expect(entry.artistUserId).toBe(TEST_USER_ARTIST_A);

      const subscription = await import('../../../subscriptions').then((m) =>
        m.getViewerSubscription(ctx.userId)
      );
      if (subscription) {
        await expectInvariantSet(subscription, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  dbTest(buildTaggedTestName(SCENARIOS[1]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('H-BOTH-002', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'collector',
        slotsLimit: 60,
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: ctx.flagAutoRenew ? 'pm-h-parity' : null,
        nextChargeAt: ctx.flagAutoRenew ? new Date('2026-09-03T00:00:00.000Z') : null,
      });

      const archive = await getMyArchiveForUser(ctx.userId);
      const subscription = await import('../../../subscriptions').then((m) =>
        m.getViewerSubscription(ctx.userId)
      );

      expect(archive.isPremium).toBe(hasPremiumAccess(await subscription, E2E_TIME_ANCHOR));

      await expectBillingSnapshot(archive.billing, {
        hasPremiumAccess: archive.isPremium,
        status: 'active',
        plan: 'collector',
      });

      const snap = buildSnapshotFromSubscription(await subscription, E2E_TIME_ANCHOR);
      expect(snap.hasPremiumAccess).toBe(archive.isPremium);

      const sub = await subscription;
      if (sub) {
        await expectInvariantSet(sub, { violations: [] }, invariantOpts(ctx));
      }
    }, E2E_TIME_ANCHOR);
  });

  dbTest(buildTaggedTestName(SCENARIOS[2]!), async () => {
    await withFrozenTime(async () => {
      const ctx = createE2eContext('H-BOTH-003', { frozenNow: E2E_TIME_ANCHOR });
      setActiveE2eContext(ctx);

      await seedTestUser(TEST_USER_ARTIST_A, 'artist-a@pr10-e2e.test');

      await seedSubscription({
        userId: ctx.userId,
        status: 'active',
        plan: 'explorer',
        expiresAt: new Date('2026-09-03T00:00:00.000Z'),
        paymentMethodId: ctx.flagAutoRenew ? 'pm-h-gate' : null,
        nextChargeAt: ctx.flagAutoRenew ? new Date('2026-09-03T00:00:00.000Z') : null,
      });

      await addArtistToArchive(ctx.userId, TEST_USER_ARTIST_A);

      expect(
        await viewerHasPremiumAccessToArtist(ctx.userId, TEST_USER_ARTIST_A, E2E_TIME_ANCHOR)
      ).toBe(true);

      await query(
        `UPDATE subscriptions
         SET status = 'expired', expires_at = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1::uuid`,
        [ctx.userId, new Date('2026-07-01T00:00:00.000Z')]
      );

      expect(
        await viewerHasPremiumAccessToArtist(ctx.userId, TEST_USER_ARTIST_A, E2E_TIME_ANCHOR)
      ).toBe(false);
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
