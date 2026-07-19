import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import type { Location, NavigateFunction } from 'react-router-dom';

import {
  buildPublicAlbumPath,
  navigateAfterAlbumSlugRename,
  resolveArtistSlugForAlbumRename,
} from '../albumRenameRedirect';
import {
  captureDashboardModalBackground,
  clearDashboardModalBackground,
  readDashboardModalBackground,
} from '../dashboardModalBackground';

function loc(pathname: string, search = '', state: unknown = null): Location {
  return {
    pathname,
    search,
    hash: '',
    state,
    key: 'test',
  };
}

describe('albumRenameRedirect', () => {
  beforeEach(() => {
    clearDashboardModalBackground();
  });

  test('buildPublicAlbumPath keeps artist query', () => {
    expect(buildPublicAlbumPath('stand-up-remastered', 'jethro-tull')).toBe(
      '/albums/stand-up-remastered?artist=jethro-tull'
    );
  });

  test('direct album route replaces URL with new slug', () => {
    const navigate = jest.fn() as unknown as NavigateFunction;
    const didNavigate = navigateAfterAlbumSlugRename({
      previousAlbumId: 'stand-up',
      newAlbumId: 'stand-up-remastered',
      artistSlug: 'jethro-tull',
      navigate,
      location: loc('/albums/stand-up', '?artist=jethro-tull'),
    });

    expect(didNavigate).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/albums/stand-up-remastered?artist=jethro-tull', {
      replace: true,
    });
  });

  test('dashboard overlay replaces backgroundLocation and keeps dashboard path', () => {
    const navigate = jest.fn() as unknown as NavigateFunction;
    const background = loc('/albums/stand-up', '?artist=jethro-tull');
    const didNavigate = navigateAfterAlbumSlugRename({
      previousAlbumId: 'stand-up',
      newAlbumId: 'stand-up-remastered',
      artistSlug: 'jethro-tull',
      navigate,
      location: loc('/dashboard-new/albums', '', { backgroundLocation: background }),
    });

    expect(didNavigate).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      {
        pathname: '/dashboard-new/albums',
        search: '',
        hash: '',
      },
      {
        replace: true,
        state: {
          backgroundLocation: expect.objectContaining({
            pathname: '/albums/stand-up-remastered',
            search: '?artist=jethro-tull',
          }),
        },
      }
    );
    expect(readDashboardModalBackground()?.pathname).toBe('/albums/stand-up-remastered');
  });

  test('title-only rename (same slug) is a no-op', () => {
    const navigate = jest.fn() as unknown as NavigateFunction;
    expect(
      navigateAfterAlbumSlugRename({
        previousAlbumId: 'stand-up',
        newAlbumId: 'stand-up',
        artistSlug: 'jethro-tull',
        navigate,
        location: loc('/albums/stand-up', '?artist=jethro-tull'),
      })
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  test('when stored modal background is the old album under dashboard, rewrites it via navigate', () => {
    captureDashboardModalBackground({
      pathname: '/albums/stand-up',
      search: '?artist=jethro-tull',
      hash: '',
    });
    const navigate = jest.fn() as unknown as NavigateFunction;
    const didNavigate = navigateAfterAlbumSlugRename({
      previousAlbumId: 'stand-up',
      newAlbumId: 'stand-up-remastered',
      artistSlug: 'jethro-tull',
      navigate,
      location: loc('/dashboard-new/albums', ''),
    });

    expect(didNavigate).toBe(true);
    expect(navigate).toHaveBeenCalled();
    expect(readDashboardModalBackground()?.pathname).toBe('/albums/stand-up-remastered');
  });

  test('when not on the renamed album surface, does not navigate', () => {
    const navigate = jest.fn() as unknown as NavigateFunction;
    const didNavigate = navigateAfterAlbumSlugRename({
      previousAlbumId: 'stand-up',
      newAlbumId: 'stand-up-remastered',
      artistSlug: 'jethro-tull',
      navigate,
      location: loc('/albums', '?artist=jethro-tull'),
    });

    expect(didNavigate).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  test('resolveArtistSlugForAlbumRename prefers surface query', () => {
    expect(
      resolveArtistSlugForAlbumRename(
        loc('/dashboard-new/albums', '', {
          backgroundLocation: loc('/albums/stand-up', '?artist=jethro-tull'),
        }),
        'fallback'
      )
    ).toBe('jethro-tull');
  });
});
