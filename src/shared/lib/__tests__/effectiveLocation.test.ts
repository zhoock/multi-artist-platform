import { describe, expect, it } from '@jest/globals';
import type { Location } from 'react-router-dom';

import { getSearchParamsFromLocation, resolveEffectiveLocation } from '../effectiveLocation';

function loc(pathname: string, search = '', state: Location['state'] = null): Location {
  return {
    pathname,
    search,
    hash: '',
    state,
    key: 'test',
  };
}

describe('resolveEffectiveLocation', () => {
  it('returns live location when no overlay', () => {
    const live = loc('/', '?artist=band');
    expect(resolveEffectiveLocation(live)).toBe(live);
  });

  it('prefers dashboard shell surface while overlay is open', () => {
    const live = loc('/dashboard-new/albums');
    const surface = loc('/', '?artist=band');
    expect(resolveEffectiveLocation(live, { overlayOpen: true, surfaceLocation: surface })).toBe(
      surface
    );
  });

  it('uses auth backgroundLocation when auth overlay is open', () => {
    const background = loc('/', '?artist=band');
    const live = loc('/auth', '?mode=login', { backgroundLocation: background });
    expect(resolveEffectiveLocation(live)).toBe(background);
  });

  it('unwraps public page when auth is opened over dashboard', () => {
    const publicPage = loc('/albums', '?artist=band');
    const dashboard = loc('/dashboard-new/albums', '', { backgroundLocation: publicPage });
    const live = loc('/auth', '?mode=login', { backgroundLocation: dashboard });
    expect(resolveEffectiveLocation(live)).toBe(publicPage);
  });

  it('keeps standalone /auth when backgroundLocation is missing', () => {
    const live = loc('/auth', '?mode=login');
    expect(resolveEffectiveLocation(live)).toBe(live);
  });
});

describe('getSearchParamsFromLocation', () => {
  it('parses artist from effective search', () => {
    const params = getSearchParamsFromLocation(loc('/', '?artist=band&x=1'));
    expect(params.get('artist')).toBe('band');
    expect(params.get('x')).toBe('1');
  });
});
