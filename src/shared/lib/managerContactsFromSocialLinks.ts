import {
  normalizeSocialLinksForSave,
  parseSocialLinksFromApi,
  socialLinksToFormState,
} from '@shared/constants/socialLinks';
import {
  normalizeManagerTelegramForStorage,
  parseTelegramFromSocialLinks,
} from '@shared/lib/parseTelegramFromSocialLinks';

export function parseManagerEmailFromSocialLinks(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>).managerEmail;
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasPublicManagerContacts(input: {
  managerEmail: string | null;
  managerTelegramUrl: string | null;
}): boolean {
  return Boolean(input.managerEmail?.trim() || input.managerTelegramUrl?.trim());
}

/**
 * Persist platform links plus optional manager contacts in `users.social_links`.
 * Platform-only saves keep existing manager fields unless explicitly patched.
 */
export function mergeSocialLinksJsonForSave(
  existingRaw: unknown,
  patch: unknown
): Record<string, string> {
  const existingPlatforms = normalizeSocialLinksForSave(
    socialLinksToFormState(parseSocialLinksFromApi(existingRaw))
  );
  const patchPlatforms = normalizeSocialLinksForSave(
    socialLinksToFormState(parseSocialLinksFromApi(patch))
  );
  const merged: Record<string, string> = { ...existingPlatforms, ...patchPlatforms };

  const patchObj =
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? (patch as Record<string, unknown>)
      : null;

  if (patchObj && Object.prototype.hasOwnProperty.call(patchObj, 'managerEmail')) {
    const email = typeof patchObj.managerEmail === 'string' ? patchObj.managerEmail.trim() : '';
    if (email) {
      merged.managerEmail = email;
    }
  } else {
    const preserved = parseManagerEmailFromSocialLinks(existingRaw);
    if (preserved) {
      merged.managerEmail = preserved;
    }
  }

  if (patchObj && Object.prototype.hasOwnProperty.call(patchObj, 'telegram')) {
    const telegram = typeof patchObj.telegram === 'string' ? patchObj.telegram.trim() : '';
    if (telegram) {
      const normalized = normalizeManagerTelegramForStorage(telegram);
      if (normalized) {
        merged.telegram = normalized;
      }
    }
  } else {
    const preserved = parseTelegramFromSocialLinks(existingRaw);
    if (preserved) {
      merged.telegram = preserved;
    }
  }

  return merged;
}
