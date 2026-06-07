import type { AuthUser } from '@shared/lib/auth';
import { isListenerAccount } from '@shared/lib/accountType';
import { readStoredProfileDisplayName } from '@shared/lib/profileDisplayName';

export type CheckoutBuyerIdentity = {
  label: string;
  displayName: string;
};

function fallbackDisplayName(lang: string, isListener: boolean): string {
  const en = lang === 'en';
  if (isListener) {
    return en ? 'Unknown user' : 'Неизвестный пользователь';
  }
  return en ? 'Unknown band' : 'Неизвестная группа';
}

/**
 * Read-only buyer identity for album checkout: listener username or artist band name.
 */
export function resolveCheckoutBuyerIdentity(
  user: AuthUser | null | undefined,
  lang: string,
  profileDisplayName?: string
): CheckoutBuyerIdentity {
  const isListener = isListenerAccount(user);
  const rawName =
    profileDisplayName?.trim() || user?.name?.trim() || readStoredProfileDisplayName().trim();

  return {
    label: isListener ? (lang === 'en' ? 'Name' : 'Имя') : lang === 'en' ? 'Band' : 'Группа',
    displayName: rawName || fallbackDisplayName(lang, isListener),
  };
}
