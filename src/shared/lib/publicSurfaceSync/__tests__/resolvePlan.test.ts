import { describe, expect, test } from '@jest/globals';
import { resolvePublicSurfacePlan } from '../resolvePlan';

describe('resolvePublicSurfacePlan', () => {
  test('track content changes revalidate catalog + albumDetails', () => {
    expect(resolvePublicSurfacePlan({ type: 'trackContentChanged', albumId: 'a1' })).toEqual({
      scopes: ['catalog', 'albumDetails'],
      albumId: 'a1',
      previousAlbumId: null,
      broadcastArtistUpdated: false,
      broadcastStems: false,
      monetizationEnabled: null,
      displayName: null,
      headerImages: null,
    });
  });

  test('album content rename keeps previousAlbumId for details invalidation', () => {
    expect(
      resolvePublicSurfacePlan({
        type: 'albumContentChanged',
        albumId: 'new-slug',
        previousAlbumId: 'old-slug',
      }).previousAlbumId
    ).toBe('old-slug');
  });

  test('album content changes also broadcast profile chrome', () => {
    const plan = resolvePublicSurfacePlan({ type: 'albumContentChanged', albumId: 'a1' });
    expect(plan.scopes).toEqual(['catalog', 'albumDetails']);
    expect(plan.broadcastArtistUpdated).toBe(true);
  });

  test('article public changes revalidate articles', () => {
    expect(resolvePublicSurfacePlan({ type: 'articlePublicChanged' }).scopes).toEqual(['articles']);
  });

  test('profile genre invalidates public artists list', () => {
    const plan = resolvePublicSurfacePlan({
      type: 'profileChanged',
      aspects: ['genre'],
    });
    expect(plan.scopes).toEqual(expect.arrayContaining(['profileChrome', 'publicArtists']));
  });

  test('monetization cascades to gated surfaces', () => {
    const plan = resolvePublicSurfacePlan({ type: 'monetizationChanged', enabled: true });
    expect(plan.scopes).toEqual(
      expect.arrayContaining(['monetization', 'catalog', 'albumDetails', 'articles', 'stems'])
    );
    expect(plan.monetizationEnabled).toBe(true);
  });

  test('stems changes refresh mixer + catalog (+ details when album known)', () => {
    expect(resolvePublicSurfacePlan({ type: 'stemsChanged', albumId: 'a1' }).scopes).toEqual(
      expect.arrayContaining(['stems', 'catalog', 'albumDetails'])
    );
  });
});
