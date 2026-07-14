import {
  filterVisibilityOptionsByMonetization,
  isPremiumContentVisibility,
  resolveEffectiveContentVisibility,
  resolveMonetizationEnabled,
} from '../artistMonetization';

describe('artistMonetization', () => {
  test('resolveMonetizationEnabled requires active shopId', () => {
    expect(resolveMonetizationEnabled(null)).toBe(false);
    expect(resolveMonetizationEnabled({ isActive: true, shopId: '' })).toBe(false);
    expect(resolveMonetizationEnabled({ isActive: false, shopId: 'shop' })).toBe(false);
    expect(resolveMonetizationEnabled({ isActive: true, shopId: ' shop ' })).toBe(true);
  });

  test('filterVisibilityOptionsByMonetization hides subscribers_only when disabled', () => {
    const options = [
      { value: 'public' },
      { value: 'subscribers_only' },
      { value: 'hidden' },
    ] as const;
    expect(filterVisibilityOptionsByMonetization(options, true)).toHaveLength(3);
    expect(filterVisibilityOptionsByMonetization(options, false).map((o) => o.value)).toEqual([
      'public',
      'hidden',
    ]);
  });

  test('resolveEffectiveContentVisibility treats premium as public when monetization off', () => {
    expect(resolveEffectiveContentVisibility('subscribers_only', false)).toBe('public');
    expect(resolveEffectiveContentVisibility('subscribers_only', true)).toBe('subscribers_only');
    expect(resolveEffectiveContentVisibility('hidden', false)).toBe('hidden');
    expect(isPremiumContentVisibility('subscribers_only')).toBe(true);
  });
});
