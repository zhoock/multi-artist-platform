import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';

import * as loader from '../audienceCityRuIndexLoader';
import { useAudienceCityRuIndex } from '../useAudienceCityRuIndex';

jest.mock('../geoAudienceCityRuIndex.json', () => ({
  __esModule: true,
  default: { 'VN|da nang': 'Дананг' },
}));

describe('useAudienceCityRuIndex', () => {
  beforeEach(() => {
    loader.resetGeoAudienceCityRuIndexCacheForTests();
  });

  test('does not load index for English UI', async () => {
    const loadSpy = jest.spyOn(loader, 'loadGeoAudienceCityRuIndex');

    const { result } = renderHook(() => useAudienceCityRuIndex(true, 'en'));
    expect(result.current('Da Nang', 'VN')).toBe('Da Nang');

    await waitFor(() => {
      expect(loadSpy).not.toHaveBeenCalled();
    });

    loadSpy.mockRestore();
  });

  test('shows original name until index loads, then localized label', async () => {
    const { result } = renderHook(() => useAudienceCityRuIndex(true, 'ru'));

    expect(result.current('Da Nang', 'VN')).toBe('Da Nang');

    await waitFor(() => {
      expect(result.current('Da Nang', 'VN')).toBe('Дананг');
    });
  });

  test('reuses cached index on remount without second load', async () => {
    await loader.loadGeoAudienceCityRuIndex();
    const loadSpy = jest.spyOn(loader, 'loadGeoAudienceCityRuIndex');

    const { result, unmount } = renderHook(() => useAudienceCityRuIndex(true, 'ru'));
    await waitFor(() => {
      expect(result.current('Da Nang', 'VN')).toBe('Дананг');
    });
    unmount();

    const { result: secondMount } = renderHook(() => useAudienceCityRuIndex(true, 'ru'));
    expect(secondMount.current('Da Nang', 'VN')).toBe('Дананг');
    expect(loadSpy).not.toHaveBeenCalled();

    loadSpy.mockRestore();
  });
});
