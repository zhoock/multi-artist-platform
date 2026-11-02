import type { SupportedLang } from '@shared/model/lang';
import { audienceCityLookupKey } from '@shared/lib/i18n/audienceCityLookupKey';

import type { GeoAudienceCityRuIndex } from './audienceCityRuIndexLoader';

export function toAudienceIntlLocale(lang: SupportedLang): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US';
}

export function formatAudienceMetricValue(value: number, lang: SupportedLang): string {
  return value.toLocaleString(toAudienceIntlLocale(lang));
}

/** ISO 3166-1 alpha-2 → localized country name via Intl.DisplayNames (CLDR). */
export function formatAudienceCountryName(countryCode: string, lang: SupportedLang): string {
  const code = countryCode.trim().toUpperCase();
  if (!code) return countryCode;
  try {
    const display = new Intl.DisplayNames([toAudienceIntlLocale(lang)], { type: 'region' }).of(
      code
    );
    return display ?? code;
  } catch {
    return code;
  }
}

/**
 * Localized city label for audience UI. DB/API keep Netlify/GeoNames ASCII names.
 * ru: Cyrillic exonyms from lazy-loaded GeoNames index; pass `null` until loaded.
 */
export function resolveAudienceCityName(
  city: string,
  countryCode: string,
  lang: SupportedLang,
  ruIndex: GeoAudienceCityRuIndex | null
): string {
  const trimmed = city.trim();
  if (!trimmed || lang === 'en') return trimmed;

  if (!ruIndex) return trimmed;

  return ruIndex[audienceCityLookupKey(countryCode, trimmed)] ?? trimmed;
}
