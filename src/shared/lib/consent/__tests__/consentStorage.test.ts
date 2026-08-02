import { beforeEach, describe, expect, test } from '@jest/globals';

import {
  CURRENT_CONSENT_VERSION,
  __resetConsentStorageForTests,
  readConsentStatus,
  saveConsentDecision,
} from '../consentStorage';

describe('consentStorage', () => {
  beforeEach(() => {
    __resetConsentStorageForTests();
  });

  test('returns unknown when storage is empty', () => {
    expect(readConsentStatus()).toBe('unknown');
  });

  test('persists accepted decision across reads', () => {
    saveConsentDecision('accepted');
    expect(readConsentStatus()).toBe('accepted');
  });

  test('persists declined decision across reads', () => {
    saveConsentDecision('declined');
    expect(readConsentStatus()).toBe('declined');
  });

  test('returns unknown when stored consentVersion is outdated', () => {
    localStorage.setItem(
      'sc_analytics_consent',
      JSON.stringify({
        status: 'accepted',
        consentVersion: CURRENT_CONSENT_VERSION - 1,
        decidedAt: new Date().toISOString(),
      })
    );

    expect(readConsentStatus()).toBe('unknown');
  });

  test('returns unknown for invalid stored payload', () => {
    localStorage.setItem('sc_analytics_consent', JSON.stringify({ status: 'maybe' }));
    expect(readConsentStatus()).toBe('unknown');
  });
});
