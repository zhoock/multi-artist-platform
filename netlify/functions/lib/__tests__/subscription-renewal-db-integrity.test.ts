/**
 * PR-5 — renewal DB integrity helpers and protocol assessment.
 */

import { describe, expect, test } from '@jest/globals';

import {
  assessRenewalFrozenPaymentProtocol,
  assessRenewalFrozenPaymentProtocolFromRaw,
  classifyRenewalAttemptInsertUniqueViolation,
  expectedRenewalIdempotenceKey,
  isDispatchLeaseFieldPairCoherent,
  isRenewalDispatchPhase,
  isPostgresUniqueViolation,
} from '../subscription-renewal-db-integrity';
import {
  buildRenewalYookassaCreatePayload,
  embedRenewalSubscriptionPaymentIdInPayload,
} from '../subscription-renewal-post-payload';
import { YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS } from '../subscription-renewal-post-policy';
import { resolveRenewalYooKassaPostRoute } from '../subscription-renewal-post-policy';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';

function basePayload() {
  return buildRenewalYookassaCreatePayload({
    amountValue: '1.00',
    description: 'Explorer Support',
    userId: USER_ID,
    planSlug: 'explorer',
    customerEmail: 'renewal@test.example',
    paymentMethodId: 'pm-test',
  });
}

describe('dispatch phase and lease invariants (PR-5)', () => {
  test('accepts known dispatch_phase values', () => {
    expect(isRenewalDispatchPhase('created')).toBe(true);
    expect(isRenewalDispatchPhase('needs_review')).toBe(true);
    expect(isRenewalDispatchPhase('bogus')).toBe(false);
    expect(isRenewalDispatchPhase(null)).toBe(false);
  });

  test('lease token and until must be paired', () => {
    expect(
      isDispatchLeaseFieldPairCoherent({
        dispatchLeaseToken: null,
        dispatchLeaseUntil: null,
      })
    ).toBe(true);
    expect(
      isDispatchLeaseFieldPairCoherent({
        dispatchLeaseToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        dispatchLeaseUntil: new Date(),
      })
    ).toBe(true);
    expect(
      isDispatchLeaseFieldPairCoherent({
        dispatchLeaseToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        dispatchLeaseUntil: null,
      })
    ).toBe(false);
  });
});

describe('assessRenewalFrozenPaymentProtocol (PR-5)', () => {
  test('PR-4 row with matching idempotence key and embedded id', () => {
    const payload = embedRenewalSubscriptionPaymentIdInPayload(basePayload(), PAYMENT_ROW_ID);
    const result = assessRenewalFrozenPaymentProtocol({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: expectedRenewalIdempotenceKey(PAYMENT_ROW_ID),
      payload,
    });
    expect(result).toEqual({ ok: true });
  });

  test('needs_review when frozen payload lacks subscriptionPaymentId metadata', () => {
    const result = assessRenewalFrozenPaymentProtocol({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: expectedRenewalIdempotenceKey(PAYMENT_ROW_ID),
      payload: basePayload(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe('missing_subscription_payment_id_in_frozen_payload');
    }
  });

  test('ambiguous when idempotence key does not match row id', () => {
    const result = assessRenewalFrozenPaymentProtocol({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: 'renewal-other-id',
      payload: basePayload(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe('idempotence_key_not_bound_to_row_id');
    }
  });

  test('ambiguous when embedded id conflicts with row', () => {
    const payload = embedRenewalSubscriptionPaymentIdInPayload(
      basePayload(),
      '99999999-9999-4999-8999-999999999999'
    );
    const result = assessRenewalFrozenPaymentProtocol({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: expectedRenewalIdempotenceKey(PAYMENT_ROW_ID),
      payload,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe('frozen_payload_subscription_payment_id_mismatch');
    }
  });

  test('assessRenewalFrozenPaymentProtocolFromRaw reads frozen payload', () => {
    const payload = embedRenewalSubscriptionPaymentIdInPayload(basePayload(), PAYMENT_ROW_ID);
    const result = assessRenewalFrozenPaymentProtocolFromRaw({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: expectedRenewalIdempotenceKey(PAYMENT_ROW_ID),
      rawLastEvent: { renewalYookassaCreatePayload: payload },
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('Postgres unique violation classification (PR-5)', () => {
  test('detects 23505 and maps open renewal index', () => {
    const err = Object.assign(new Error('duplicate key'), {
      code: '23505',
      message: 'duplicate key idx_subscription_payments_one_open_renewal_per_subscription',
    });
    expect(isPostgresUniqueViolation(err)).toBe(true);
    expect(classifyRenewalAttemptInsertUniqueViolation(err)).toBe('open_renewal_for_subscription');
  });

  test('maps idempotence_key unique index', () => {
    const err = Object.assign(new Error('dup'), {
      code: '23505',
      message: 'idx_subscription_payments_idempotence_key_unique',
    });
    expect(classifyRenewalAttemptInsertUniqueViolation(err)).toBe('idempotence_key_conflict');
  });
});

describe('renewal POST policy interaction (PR-5)', () => {
  test('attempt older than 24h cannot repeat POST', () => {
    const firstPostAt = new Date('2020-01-01T00:00:00.000Z');
    const route = resolveRenewalYooKassaPostRoute({
      providerPaymentId: null,
      firstPostAt,
      now: new Date(firstPostAt.getTime() + YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS + 1),
    });
    expect(route).toBe('needs_review');
  });

  test('ambiguous protocol blocks POST even inside 24h window', () => {
    const route = resolveRenewalYooKassaPostRoute({
      providerPaymentId: null,
      firstPostAt: new Date(),
      now: new Date(),
    });
    expect(route).toBe('repeat_post');
    const protocol = assessRenewalFrozenPaymentProtocol({
      subscriptionPaymentId: PAYMENT_ROW_ID,
      idempotenceKey: 'renewal-wrong',
      payload: basePayload(),
    });
    expect(protocol.ok).toBe(false);
  });
});
