import { describe, expect, test } from '@jest/globals';

import { resolveSubscriptionClientError } from '../resolveSubscriptionClientError';

const ruCopy = {
  billingPlanChangeError: 'Не удалось изменить тариф',
  billingCheckoutErrorGeneric: 'Не удалось выполнить операцию. Попробуйте ещё раз.',
  billingCheckoutUpgradeIntentRequired:
    'Не удалось начать повышение тарифа. Обновите страницу и попробуйте снова.',
  billingCheckoutInProgress: 'Оплата уже начата. Завершите её или подождите несколько минут.',
};

describe('resolveSubscriptionClientError', () => {
  test('maps UPGRADE_INTENT_REQUIRED to localized copy', () => {
    expect(
      resolveSubscriptionClientError(
        {
          code: 'UPGRADE_INTENT_REQUIRED',
          error: 'Mid-cycle plan upgrade requires intent=upgrade checkout',
        },
        ruCopy
      )
    ).toBe(ruCopy.billingCheckoutUpgradeIntentRequired);
  });

  test('maps CHECKOUT_IN_PROGRESS to localized copy', () => {
    expect(
      resolveSubscriptionClientError(
        {
          code: 'CHECKOUT_IN_PROGRESS',
          error:
            'A subscription checkout is already in progress. Complete or wait for it to expire.',
        },
        ruCopy
      )
    ).toBe(ruCopy.billingCheckoutInProgress);
  });

  test('maps YOOKASSA_CHECKOUT_FAILED to localized copy', () => {
    expect(
      resolveSubscriptionClientError(
        {
          code: 'YOOKASSA_CHECKOUT_FAILED',
          error: 'Failed to create subscription payment',
        },
        {
          ...ruCopy,
          billingCheckoutCreateFailed: 'Не удалось создать платёж.',
        }
      )
    ).toBe('Не удалось создать платёж.');
  });

  test('hides FEATURE_DISABLED internal text', () => {
    expect(
      resolveSubscriptionClientError(
        { code: 'FEATURE_DISABLED', error: 'Upgrade checkout is not enabled' },
        ruCopy
      )
    ).toBe(ruCopy.billingCheckoutErrorGeneric);
  });

  test('falls back to generic for unknown coded errors', () => {
    expect(
      resolveSubscriptionClientError({ code: 'UNKNOWN', error: 'Internal English detail' }, ruCopy)
    ).toBe(ruCopy.billingCheckoutErrorGeneric);
  });

  test('uses raw error only when code is missing', () => {
    expect(resolveSubscriptionClientError({ error: 'Network timeout' }, ruCopy)).toBe(
      'Network timeout'
    );
  });
});
