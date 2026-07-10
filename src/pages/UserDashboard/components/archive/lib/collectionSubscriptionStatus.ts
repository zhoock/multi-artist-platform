export type CollectionSubscriptionStatus = 'active' | 'expiring' | 'expired';

export const COLLECTION_SUBSCRIPTION_EXPIRING_SOON_DAYS = 7;

export function resolveCollectionSubscriptionStatus(params: {
  isPremium: boolean;
  expiresAt: string | null | undefined;
  now?: Date;
  expiringSoonDays?: number;
}): CollectionSubscriptionStatus | null {
  const {
    isPremium,
    expiresAt,
    now = new Date(),
    expiringSoonDays = COLLECTION_SUBSCRIPTION_EXPIRING_SOON_DAYS,
  } = params;

  if (!expiresAt) {
    if (!isPremium) return null;
    return 'active';
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return isPremium ? 'active' : 'expired';
  }

  const msRemaining = expiry.getTime() - now.getTime();
  if (msRemaining <= 0 || !isPremium) return 'expired';

  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  if (daysRemaining <= expiringSoonDays) return 'expiring';
  return 'active';
}

export function getSubscriptionDaysRemaining(expiresAt: string, now: Date = new Date()): number {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return 0;
  const msRemaining = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

export function formatCollectionRenewalDate(iso: string, lang: 'en' | 'ru'): string | null {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function formatSubscriptionDaysRemainingLabel(days: number, lang: 'en' | 'ru'): string {
  if (lang === 'en') {
    return days === 1 ? `${days} day left` : `${days} days left`;
  }

  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod100 >= 11 && mod100 <= 14) return `Осталось ${days} дней`;
  if (mod10 === 1) return `Осталось ${days} день`;
  if (mod10 >= 2 && mod10 <= 4) return `Осталось ${days} дня`;
  return `Осталось ${days} дней`;
}
