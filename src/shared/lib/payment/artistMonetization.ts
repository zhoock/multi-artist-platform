/**
 * Единый флаг монетизации артиста: активный приём платежей (сейчас — ЮKassa).
 * Все premium-функции (subscribers_only, коллекция, подписка на артиста) включаются
 * только при monetizationEnabled === true.
 */

export const PREMIUM_CONTENT_VISIBILITY = 'subscribers_only' as const;

export type MonetizationSettingsLike =
  | {
      isActive?: boolean | null;
      shopId?: string | null;
    }
  | null
  | undefined;

/** Активные платёжные реквизиты → монетизация включена. */
export function resolveMonetizationEnabled(settings: MonetizationSettingsLike): boolean {
  return Boolean(settings?.isActive && settings?.shopId?.trim());
}

export function isPremiumContentVisibility(value: string | null | undefined): boolean {
  return value === PREMIUM_CONTENT_VISIBILITY;
}

/**
 * Пока монетизация выключена, subscribers_only ведёт себя как публичный контент.
 * Hidden остаётся hidden.
 */
export function resolveEffectiveContentVisibility<T extends string>(
  visibility: T,
  monetizationEnabled: boolean
): T {
  if (!monetizationEnabled && isPremiumContentVisibility(visibility)) {
    return 'public' as T;
  }
  return visibility;
}

/** Убирает пункт «Только подписчикам» из меню видимости, пока платежи не подключены. */
export function filterVisibilityOptionsByMonetization<T extends { value: string }>(
  options: readonly T[],
  monetizationEnabled: boolean
): T[] {
  if (monetizationEnabled) return [...options];
  return options.filter((opt) => !isPremiumContentVisibility(opt.value));
}
