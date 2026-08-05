/**
 * Unit tests for subscription-payment-method (PR-9).
 */

import { describe, expect, test } from '@jest/globals';
import {
  devMockPaymentMethodTitle,
  formatPaymentMethodTitle,
  formatPaymentMethodTitleFromCard,
  normalizeCardBrandLabel,
} from '../subscription-payment-method';

describe('formatPaymentMethodTitleFromCard', () => {
  test('formats Visa mask without exposing full PAN', () => {
    expect(formatPaymentMethodTitleFromCard({ cardType: 'visa', last4: '4242' })).toBe(
      'Visa •••• 4242'
    );
  });

  test('formats MasterCard mask', () => {
    expect(formatPaymentMethodTitleFromCard({ cardType: 'MasterCard', last4: '5512' })).toBe(
      'MasterCard •••• 5512'
    );
  });

  test('returns null for invalid last4', () => {
    expect(formatPaymentMethodTitleFromCard({ cardType: 'visa', last4: '42' })).toBeNull();
    expect(formatPaymentMethodTitleFromCard({ cardType: 'visa', last4: '42424242' })).toBeNull();
  });
});

describe('formatPaymentMethodTitle', () => {
  test('returns trimmed title from provider payment method', () => {
    expect(formatPaymentMethodTitle({ id: 'pm-1', saved: true, title: 'Visa •••• 4242' })).toBe(
      'Visa •••• 4242'
    );
  });

  test('returns null when title missing', () => {
    expect(formatPaymentMethodTitle({ id: 'pm-1', saved: true, title: null })).toBeNull();
  });
});

describe('normalizeCardBrandLabel', () => {
  test('maps known card types', () => {
    expect(normalizeCardBrandLabel('mastercard')).toBe('MasterCard');
    expect(normalizeCardBrandLabel('mir')).toBe('Mir');
  });
});

describe('devMockPaymentMethodTitle', () => {
  test('returns stable dev mask', () => {
    expect(devMockPaymentMethodTitle('pay-abc-4242')).toMatch(/^Visa •••• \d{4}$/);
  });
});
