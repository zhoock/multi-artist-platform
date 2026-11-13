import { describe, expect, test } from '@jest/globals';
import { CURRENT_USER_AGREEMENT_VERSION, parseUserAgreementAccepted } from '../user-agreement';

describe('user-agreement', () => {
  test('parseUserAgreementAccepted requires explicit true', () => {
    expect(parseUserAgreementAccepted({ userAgreementAccepted: true })).toBe(true);
    expect(parseUserAgreementAccepted({ userAgreementAccepted: false })).toBe(false);
    expect(parseUserAgreementAccepted({})).toBe(false);
  });

  test('CURRENT_USER_AGREEMENT_VERSION matches legal JSON meta', () => {
    expect(CURRENT_USER_AGREEMENT_VERSION).toBe(2);
  });
});
