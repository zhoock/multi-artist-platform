import { describe, expect, test, beforeEach } from '@jest/globals';

import {
  captureDashboardModalBackground,
  clearDashboardModalBackground,
  isPaymentReturnPathname,
  isValidDashboardModalBackground,
  localizeDashboardModalBackground,
  primeDashboardModalSessionFromLocation,
  readDashboardModalBackground,
  resolveDashboardModalCloseTarget,
} from '../dashboardModalBackground';

const STORAGE_KEY = 'sc-dashboard-modal-bg';

describe('dashboardModalBackground', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('rejects payment return paths as modal background', () => {
    expect(isPaymentReturnPathname('/pay/subscription-success')).toBe(true);
    expect(isValidDashboardModalBackground({ pathname: '/pay/subscription-success' })).toBe(false);
    expect(isValidDashboardModalBackground({ pathname: '/?artist=foo' })).toBe(true);
  });

  test('does not overwrite stored background on payment return page', () => {
    captureDashboardModalBackground({
      pathname: '/',
      search: '?artist=beatles',
      hash: '',
    });

    primeDashboardModalSessionFromLocation({
      pathname: '/pay/subscription-success',
      search: '?returnTo=%2Fdashboard-new%2Fcollection',
      hash: '',
      state: null,
      key: 'pay',
    });

    expect(readDashboardModalBackground()).toEqual({
      pathname: '/',
      search: '?artist=beatles',
      hash: '',
    });
  });

  test('resolveDashboardModalCloseTarget skips invalid payment background', () => {
    captureDashboardModalBackground({
      pathname: '/',
      search: '',
      hash: '',
    });

    const closeTarget = resolveDashboardModalCloseTarget({
      backgroundLocation: {
        pathname: '/pay/subscription-success',
        search: '?returnTo=%2Fdashboard-new%2Fcollection',
        hash: '',
        state: null,
        key: 'pay',
      },
    });

    expect(closeTarget?.pathname).toBe('/');
  });

  test('clearDashboardModalBackground removes stored value', () => {
    captureDashboardModalBackground({ pathname: '/', search: '', hash: '' });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeTruthy();
    clearDashboardModalBackground();
    expect(readDashboardModalBackground()).toBeNull();
  });

  test('localizeDashboardModalBackground swaps locale prefix and keeps query', () => {
    expect(
      localizeDashboardModalBackground(
        { pathname: '/ru/albums', search: '?artist=foo', hash: '' },
        'en'
      )
    ).toEqual({
      pathname: '/en/albums',
      search: '?artist=foo',
      hash: '',
    });
  });

  test('localizeDashboardModalBackground leaves unprefixed paths unchanged', () => {
    const bg = { pathname: '/dashboard-new/settings', search: '', hash: '' };
    expect(localizeDashboardModalBackground(bg, 'en')).toEqual(bg);
  });
});
