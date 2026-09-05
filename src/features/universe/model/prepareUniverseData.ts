import type { SceneArtist } from '@components/view/universe3dTypes';

export function prepareUniverseData(artists: SceneArtist[]): SceneArtist[] {
  return artists.map((a) => ({
    ...a,
    genreCode: a.genreCode || 'other',
  }));
}
