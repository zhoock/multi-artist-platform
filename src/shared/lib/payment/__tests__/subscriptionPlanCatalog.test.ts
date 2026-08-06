import { describe, expect, test } from '@jest/globals';

import {
  formatPlanAmountValue,
  getPlanAmountRub,
  getPlanPriceCurrencyCode,
  getPlanPriceCurrencyDisplay,
  PLAN_CATALOG,
  SUBSCRIPTION_PLAN_CATALOG,
  SUBSCRIPTION_PLAN_PRICE_CURRENCY,
  SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE,
  SUBSCRIPTION_PLAN_PRICE_RUB,
} from '../subscriptionPlanCatalog';

describe('subscriptionPlanCatalog', () => {
  test('defines shared slot limits', () => {
    expect(PLAN_CATALOG.explorer.slotsLimit).toBe(20);
    expect(PLAN_CATALOG.collector.slotsLimit).toBe(60);
    expect(PLAN_CATALOG.archivist.slotsLimit).toBe(100);
  });

  test('uses single billing QA price for all plans', () => {
    expect(SUBSCRIPTION_PLAN_PRICE_RUB).toBe(1);
    expect(SUBSCRIPTION_PLAN_PRICE_CURRENCY).toBe('₽');
    expect(SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE).toBe('RUB');
    expect(getPlanAmountRub('explorer')).toBe(1);
    expect(getPlanAmountRub('collector')).toBe(1);
    expect(getPlanAmountRub('archivist')).toBe(1);
    expect(formatPlanAmountValue('explorer')).toBe('1.00');
    expect(getPlanPriceCurrencyDisplay()).toBe('₽');
    expect(getPlanPriceCurrencyCode()).toBe('RUB');
    expect(SUBSCRIPTION_PLAN_CATALOG.explorer.priceRubProduction).toBe(
      SUBSCRIPTION_PLAN_CATALOG.archivist.priceRubProduction
    );
  });
});
