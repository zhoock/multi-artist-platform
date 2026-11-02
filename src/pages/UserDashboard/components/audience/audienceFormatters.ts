export function formatAudienceMetricValue(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

export function formatAudienceCountryName(countryCode: string, locale: string): string {
  try {
    const display = new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode);
    return display ?? countryCode;
  } catch {
    return countryCode;
  }
}
