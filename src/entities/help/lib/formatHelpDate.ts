import type { SupportedLang } from '@shared/model/lang';

export function formatHelpDate(value: string, lang: SupportedLang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
