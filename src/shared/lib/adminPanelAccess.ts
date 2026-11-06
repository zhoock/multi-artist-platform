import { saveAuth, getToken, type AuthUser } from './auth';

type AdminSessionResponse = {
  success: boolean;
  data?: {
    allowed?: boolean;
    token?: string;
    user?: AuthUser;
  };
  error?: string;
  code?: string;
};

/**
 * Refreshes JWT from server using DB-backed admin check. Caller should redirect on !allowed.
 */
export async function verifyAdminPanelAccess(): Promise<{
  allowed: boolean;
  user: AuthUser | null;
}> {
  const token = getToken();
  if (!token) {
    return { allowed: false, user: null };
  }

  try {
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = (await response.json()) as AdminSessionResponse;

    if (
      response.ok &&
      result.success &&
      result.data?.allowed &&
      result.data.token &&
      result.data.user
    ) {
      saveAuth(result.data.token, result.data.user);
      return { allowed: true, user: result.data.user };
    }

    return { allowed: false, user: null };
  } catch {
    return { allowed: false, user: null };
  }
}
