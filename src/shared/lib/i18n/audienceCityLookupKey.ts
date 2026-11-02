export function audienceCityLookupKey(countryCode: string, cityName: string): string {
  return `${countryCode.trim().toUpperCase()}|${cityName.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}
