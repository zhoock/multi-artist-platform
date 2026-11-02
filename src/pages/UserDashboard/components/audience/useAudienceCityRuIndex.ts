import { useCallback, useEffect, useState } from 'react';

import type { SupportedLang } from '@shared/model/lang';

import { resolveAudienceCityName } from './audienceFormatters';
import {
  getCachedGeoAudienceCityRuIndex,
  loadGeoAudienceCityRuIndex,
  type GeoAudienceCityRuIndex,
} from './audienceCityRuIndexLoader';

/**
 * Loads the GeoNames RU city index when `enabled` and `lang === 'ru'`.
 * Returns a formatter that falls back to API city names until the chunk loads.
 */
export function useAudienceCityRuIndex(
  enabled: boolean,
  lang: SupportedLang
): (city: string, countryCode: string) => string {
  const [index, setIndex] = useState<GeoAudienceCityRuIndex | null>(() => {
    if (!enabled || lang !== 'ru') return null;
    return getCachedGeoAudienceCityRuIndex();
  });

  useEffect(() => {
    if (!enabled || lang !== 'ru') {
      setIndex(null);
      return;
    }

    const cached = getCachedGeoAudienceCityRuIndex();
    if (cached) {
      setIndex(cached);
      return;
    }

    let cancelled = false;
    void loadGeoAudienceCityRuIndex().then((loaded) => {
      if (!cancelled) {
        setIndex(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, lang]);

  return useCallback(
    (city: string, countryCode: string) => resolveAudienceCityName(city, countryCode, lang, index),
    [index, lang]
  );
}
