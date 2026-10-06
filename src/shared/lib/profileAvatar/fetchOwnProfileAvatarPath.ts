import { buildApiUrl } from '@shared/lib/artistQuery';
import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

type UserProfileAvatarResponse = {
  success?: boolean;
  data?: {
    profileAvatarPath?: string | null;
  };
};

/**
 * Loads canonical Profile Avatar storage path for the signed-in user (own profile only).
 */
export async function fetchOwnProfileAvatarPath(lang?: string): Promise<string | null> {
  const response = await fetchWithAuthSession(
    buildApiUrl('/api/user-profile', { lang }, { includeArtist: false }),
    {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        ...getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  let payload: UserProfileAvatarResponse;
  try {
    payload = (await response.json()) as UserProfileAvatarResponse;
  } catch {
    return null;
  }

  if (!payload.success || !payload.data) {
    return null;
  }

  const raw = payload.data.profileAvatarPath;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }

  return null;
}
