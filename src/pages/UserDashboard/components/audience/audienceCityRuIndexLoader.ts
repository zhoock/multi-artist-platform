export type GeoAudienceCityRuIndex = Record<string, string>;

let cachedIndex: GeoAudienceCityRuIndex | null = null;
let loadPromise: Promise<GeoAudienceCityRuIndex> | null = null;

export function getCachedGeoAudienceCityRuIndex(): GeoAudienceCityRuIndex | null {
  return cachedIndex;
}

/** Resets module cache (tests only). */
export function resetGeoAudienceCityRuIndexCacheForTests(): void {
  cachedIndex = null;
  loadPromise = null;
}

export function loadGeoAudienceCityRuIndex(): Promise<GeoAudienceCityRuIndex> {
  if (cachedIndex) {
    return Promise.resolve(cachedIndex);
  }

  if (!loadPromise) {
    loadPromise = import(
      /* webpackChunkName: "geo-audience-city-ru-index" */
      './geoAudienceCityRuIndex.json'
    )
      .then((module) => {
        const index = (module.default ?? module) as GeoAudienceCityRuIndex;
        cachedIndex = index;
        return index;
      })
      .catch(() => {
        loadPromise = null;
        return {};
      });
  }

  return loadPromise;
}
