import { getCatalogAlbumCoverProps, pickCatalogWebpVariantForDpr } from '../catalogAlbumCoverProps';

describe('catalogAlbumCoverProps', () => {
  it('grid layout caps Retina at -448', () => {
    expect(getCatalogAlbumCoverProps(true)).toEqual({
      size: 224,
      densities: [1, 2],
      sizes: '(min-width: 768px) 250px, 90vw',
    });
    expect(pickCatalogWebpVariantForDpr(1, true)).toBe(448);
    expect(pickCatalogWebpVariantForDpr(2, true)).toBe(448);
    expect(pickCatalogWebpVariantForDpr(3, true)).toBe(448);
  });

  it('mobile layout keeps -896 at 2x/3x and avoids -1344', () => {
    expect(getCatalogAlbumCoverProps(false)).toEqual({
      size: 360,
      densities: [1, 2],
      sizes: '90vw',
    });
    expect(pickCatalogWebpVariantForDpr(1, false)).toBe(448);
    expect(pickCatalogWebpVariantForDpr(2, false)).toBe(896);
    expect(pickCatalogWebpVariantForDpr(3, false)).toBe(896);
  });
});
