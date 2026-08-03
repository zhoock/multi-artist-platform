import type { SupportedLang } from '@shared/model/lang';

/** Short numeric date for legal pages (Offer, Privacy): DD.MM.YYYY (ru) / DD/MM/YYYY (en). */
export function formatLegalPageDate(lang: SupportedLang, date: Date = new Date()): string {
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
