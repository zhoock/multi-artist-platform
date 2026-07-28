import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

export type RegenerateTrackAssetsResult =
  | { success: true; processingStatus: 'pending' }
  | { success: false; error: string };

export async function regenerateTrackAssets(
  albumId: string,
  trackId: string
): Promise<RegenerateTrackAssetsResult> {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'User is not authenticated. Please log in.' };
  }

  const response = await fetchWithAuthSession('/api/tracks/regenerate-assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ albumId, trackId }),
  });

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (typeof json === 'object' && json !== null && 'error' in json) {
      return { success: false, error: String((json as { error: unknown }).error) };
    }
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  return { success: true, processingStatus: 'pending' };
}
