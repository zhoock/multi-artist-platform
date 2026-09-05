import type { SceneArtist } from '@components/view/universe3dTypes';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

import { readPremiumCheckoutArtistSlug } from './premiumSuccessModalStorage';

export type CheckoutArtistCard = {
  artistUserId: string;
  name: string;
  slug: string;
  genreLabel: string;
  cover: string | null;
};

export async function resolveCheckoutArtistCard(
  lang: 'en' | 'ru'
): Promise<CheckoutArtistCard | null> {
  const slug = readPremiumCheckoutArtistSlug();
  if (!slug) return null;

  try {
    const response = await fetchWithAuthSession('/api/public-artists');
    const payload = (await response.json()) as {
      success?: boolean;
      data?: SceneArtist[];
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
      return null;
    }

    const match = payload.data.find((a) => a.publicSlug?.trim() === slug);
    if (!match?.userId) return null;

    const cover = match.headerImages?.[0]?.trim() || null;
    const genreLabel = match.genreLabel?.[lang] ?? match.genreLabel?.en ?? match.genreCode ?? '';

    return {
      artistUserId: match.userId,
      name: match.name,
      slug: match.publicSlug,
      genreLabel,
      cover,
    };
  } catch {
    return null;
  }
}
