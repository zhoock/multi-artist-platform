import { describe, expect, test, jest, beforeEach } from '@jest/globals';

import {
  getCachedGeoAudienceCityRuIndex,
  loadGeoAudienceCityRuIndex,
  resetGeoAudienceCityRuIndexCacheForTests,
} from '../audienceCityRuIndexLoader';

jest.mock('../geoAudienceCityRuIndex.json', () => ({
  __esModule: true,
  default: { 'VN|da nang': 'Дананг' },
}));

describe('loadGeoAudienceCityRuIndex', () => {
  beforeEach(() => {
    resetGeoAudienceCityRuIndexCacheForTests();
  });

  test('loads index once and caches subsequent calls', async () => {
    const first = await loadGeoAudienceCityRuIndex();
    const second = await loadGeoAudienceCityRuIndex();

    expect(first['VN|da nang']).toBe('Дананг');
    expect(second).toBe(first);
    expect(getCachedGeoAudienceCityRuIndex()).toBe(first);
  });
});
