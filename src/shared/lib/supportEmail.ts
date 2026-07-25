/** Temporary platform placeholder until the official support address is chosen. */
export const DEFAULT_SUPPORT_EMAIL = 'support@example.com';

/** Placeholder in static JSON copy (e.g. offer pages) substituted at runtime. */
export const SUPPORT_EMAIL_PLACEHOLDER = '{{supportEmail}}';

export function getSupportEmail(): string {
  const fromEnv = (process.env.SUPPORT_EMAIL || '').trim();
  return fromEnv || DEFAULT_SUPPORT_EMAIL;
}

export function buildSupportMailtoHref(options?: { subject?: string }): string {
  const email = getSupportEmail();
  if (!options?.subject?.trim()) {
    return `mailto:${email}`;
  }
  return `mailto:${email}?subject=${encodeURIComponent(options.subject.trim())}`;
}

export function substituteSupportEmail(text: string, email = getSupportEmail()): string {
  return text.split(SUPPORT_EMAIL_PLACEHOLDER).join(email);
}
