/**
 * PR-4 — frozen renewal payload carries stable internal payment id.
 */

import { describe, expect, test } from '@jest/globals';

import {
  buildRenewalYookassaCreatePayload,
  canonicalJsonStringify,
  embedRenewalSubscriptionPaymentIdInPayload,
  hashRenewalRequestPayload,
  readRenewalSubscriptionPaymentIdFromPayload,
} from '../subscription-renewal-post-payload';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';

describe('renewal frozen payload internal id (PR-4)', () => {
  test('embed is stable for repeat POST identity hash', () => {
    const base = buildRenewalYookassaCreatePayload({
      amountValue: '1.00',
      description: 'Explorer Support',
      userId: USER_ID,
      planSlug: 'explorer',
      customerEmail: 'renewal@test.example',
      paymentMethodId: 'pm-test',
    });

    const frozen = embedRenewalSubscriptionPaymentIdInPayload(base, PAYMENT_ROW_ID);
    const again = embedRenewalSubscriptionPaymentIdInPayload(base, PAYMENT_ROW_ID);

    expect(readRenewalSubscriptionPaymentIdFromPayload(frozen)).toBe(PAYMENT_ROW_ID);
    expect(hashRenewalRequestPayload(frozen)).toBe(hashRenewalRequestPayload(again));
    expect(canonicalJsonStringify(frozen)).toContain(PAYMENT_ROW_ID);
  });
});
