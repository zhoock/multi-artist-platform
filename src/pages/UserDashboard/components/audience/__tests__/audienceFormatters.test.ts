import { describe, expect, test } from '@jest/globals';

import {
  formatAudienceCountryName,
  resolveAudienceCityName,
  toAudienceIntlLocale,
} from '../audienceFormatters';

describe('audienceFormatters geo display', () => {
  test('toAudienceIntlLocale maps site languages to BCP47', () => {
    expect(toAudienceIntlLocale('ru')).toBe('ru-RU');
    expect(toAudienceIntlLocale('en')).toBe('en-US');
  });

  test('formatAudienceCountryName uses Intl.DisplayNames', () => {
    expect(formatAudienceCountryName('VN', 'ru')).toBe('Вьетнам');
    expect(formatAudienceCountryName('VN', 'en')).toBe('Vietnam');
  });

  test('resolveAudienceCityName keeps English GeoIP names on en', () => {
    expect(resolveAudienceCityName('Da Nang', 'VN', 'en', { 'VN|da nang': 'Дананг' })).toBe(
      'Da Nang'
    );
  });

  test('resolveAudienceCityName uses index when loaded', () => {
    expect(resolveAudienceCityName('Da Nang', 'VN', 'ru', { 'VN|da nang': 'Дананг' })).toBe(
      'Дананг'
    );
  });

  test('resolveAudienceCityName falls back before index is loaded', () => {
    expect(resolveAudienceCityName('Da Nang', 'VN', 'ru', null)).toBe('Da Nang');
    expect(resolveAudienceCityName('Unknown Hamlet XYZ', 'VN', 'ru', {})).toBe(
      'Unknown Hamlet XYZ'
    );
  });
});
