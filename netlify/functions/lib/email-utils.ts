export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function getSiteDisplayName(): string {
  return (process.env.SITE_DISPLAY_NAME || 'Mixer').trim();
}

/** Resend "From" when `EMAIL_FROM` is unset — keeps legacy sender until env is configured. */
export const DEFAULT_EMAIL_FROM = 'Название сайта <noreply@smolyanoechuchelko.ru>';

export function getEmailFrom(): string {
  const fromEnv = (process.env.EMAIL_FROM || '').trim();
  return fromEnv || DEFAULT_EMAIL_FROM;
}
