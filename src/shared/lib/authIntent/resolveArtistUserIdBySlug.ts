import type { SceneArtist } from '@components/view/universe3dTypes';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

export async function resolveArtistUserIdByPublicSlug(slug: string): Promise<string | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  try {
    const response = await fetchWithAuthSession('/api/public-artists');
    const payload = (await response.json()) as {
      success?: boolean;
      data?: SceneArtist[];
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
      return null;
    }
    const match = payload.data.find((a) => a.publicSlug?.trim() === trimmed);
    return match?.userId?.trim() ?? null;
  } catch {
    return null;
  }
}
