// src/pages/StemsPlayground/lib/pluralizeTracks.ts
import type { SupportedLang } from '@shared/model/lang';

export type TrackCountLabels = {
  one: string;
  few: string;
  many: string;
};

/** Подставляет {count} и выбирает форму множественного числа по правилам языка. */
export function pluralizeTracks(
  count: number,
  lang: SupportedLang,
  labels: TrackCountLabels
): string {
  const template = selectForm(count, lang, labels);
  return template.replace('{count}', String(count));
}

function selectForm(count: number, lang: SupportedLang, labels: TrackCountLabels): string {
  if (lang === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return labels.one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return labels.few;
    return labels.many;
  }
  return count === 1 ? labels.one : labels.many;
}
