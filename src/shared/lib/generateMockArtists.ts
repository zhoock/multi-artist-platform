import type { SceneArtist } from '@components/view/universe3dTypes';

const GENRES = ['rock', 'punk', 'grunge', 'metal', 'alternative'];

export function generateMockArtists(count: number): SceneArtist[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Artist ${i + 1}`,
    publicSlug: `artist-${i + 1}`,
    genreCode: GENRES[i % GENRES.length] ?? 'other',
  }));
}
