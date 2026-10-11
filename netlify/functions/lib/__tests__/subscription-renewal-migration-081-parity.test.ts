/**
 * Parity with database/migrations/081_subscription_renewal_pr4_protocol.sql pre-check + CHECKs.
 * Does not execute SQL — mirrors predicates for documentation and regression safety.
 */

import { describe, expect, test } from '@jest/globals';

import {
  embedRenewalSubscriptionPaymentIdInPayload,
  buildRenewalYookassaCreatePayload,
} from '../subscription-renewal-post-payload';

type RenewalRow081 = {
  id: string;
  kind: string;
  subscription_id: string | null;
  idempotence_key: string | null;
  request_payload_hash: string | null;
  dispatch_phase: string | null;
  raw_last_event: unknown;
};

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '11111111-1111-4111-8111-111111111111';

/** Same disjunction as 081 pre-check (any true → violation). */
export function renewalRowViolates081Protocol(row: RenewalRow081): boolean {
  if (row.kind !== 'renewal') return false;

  if (row.subscription_id == null) return true;

  if (
    row.idempotence_key == null ||
    row.request_payload_hash == null ||
    row.dispatch_phase == null
  ) {
    return true;
  }

  const raw = row.raw_last_event;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return true;
  }
  const record = raw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'renewalYookassaCreatePayload')) {
    return true;
  }
  const frozen = record.renewalYookassaCreatePayload;
  if (frozen == null || typeof frozen !== 'object' || Array.isArray(frozen)) {
    return true;
  }
  const metadata = (frozen as Record<string, unknown>).metadata;
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return true;
  }
  const embedded = (metadata as Record<string, unknown>).subscriptionPaymentId;
  if (typeof embedded !== 'string' || embedded.trim() === '') {
    return true;
  }
  if (embedded.trim() !== row.id) {
    return true;
  }

  return false;
}

function validRenewalRow(overrides: Partial<RenewalRow081> = {}): RenewalRow081 {
  const payload = embedRenewalSubscriptionPaymentIdInPayload(
    buildRenewalYookassaCreatePayload({
      amountValue: '1.00',
      description: 'Explorer Support',
      userId: USER_ID,
      planSlug: 'explorer',
      customerEmail: 'renewal@test.example',
      paymentMethodId: 'pm-test',
    }),
    PAYMENT_ROW_ID
  );
  return {
    id: PAYMENT_ROW_ID,
    kind: 'renewal',
    subscription_id: SUB_ID,
    idempotence_key: `renewal-${PAYMENT_ROW_ID}`,
    request_payload_hash: 'abc123hash',
    dispatch_phase: 'created',
    raw_last_event: { renewalYookassaCreatePayload: payload },
    ...overrides,
  };
}

describe('081 migration protocol parity (SQL pre-check / CHECK)', () => {
  test('valid PR-4+ renewal row passes', () => {
    expect(renewalRowViolates081Protocol(validRenewalRow())).toBe(false);
  });

  test('non-renewal kinds are not in scope', () => {
    expect(
      renewalRowViolates081Protocol({
        ...validRenewalRow(),
        kind: 'initial',
        subscription_id: null,
        idempotence_key: null,
        request_payload_hash: null,
        dispatch_phase: null,
        raw_last_event: null,
      })
    ).toBe(false);
  });

  test.each([
    ['subscription_id', { subscription_id: null }],
    ['idempotence_key', { idempotence_key: null }],
    ['request_payload_hash', { request_payload_hash: null }],
    ['dispatch_phase', { dispatch_phase: null }],
    ['missing frozen key', { raw_last_event: {} }],
    [
      'metadata mismatch',
      {
        raw_last_event: {
          renewalYookassaCreatePayload: embedRenewalSubscriptionPaymentIdInPayload(
            buildRenewalYookassaCreatePayload({
              amountValue: '1.00',
              description: 'Explorer Support',
              userId: USER_ID,
              planSlug: 'explorer',
              customerEmail: 'renewal@test.example',
              paymentMethodId: 'pm-test',
            }),
            '99999999-9999-4999-8999-999999999999'
          ),
        },
      },
    ],
  ] as const)('renewal violation: %s', (_label, patch) => {
    expect(renewalRowViolates081Protocol(validRenewalRow(patch))).toBe(true);
  });
});
