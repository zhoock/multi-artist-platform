const ACCOUNT_DELETED_SKIP_RETURN_KEY = 'sc-account-deleted-skip-return';
const ACCOUNT_DELETED_LEAVE_ARTIST_KEY = 'sc-account-deleted-leave-artist';

/** После удаления: не возвращать на artist-страницу из returnTo и уйти с ?artist= удалённого slug. */
export function markAccountDeletedSession(): void {
  try {
    sessionStorage.setItem(ACCOUNT_DELETED_SKIP_RETURN_KEY, '1');
    sessionStorage.setItem(ACCOUNT_DELETED_LEAVE_ARTIST_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function shouldForcePostAuthHome(): boolean {
  try {
    return sessionStorage.getItem(ACCOUNT_DELETED_SKIP_RETURN_KEY) === '1';
  } catch {
    return false;
  }
}

export function shouldLeaveDeletedArtistPage(): boolean {
  try {
    return sessionStorage.getItem(ACCOUNT_DELETED_LEAVE_ARTIST_KEY) === '1';
  } catch {
    return false;
  }
}

/** Сессия после удаления своего аккаунта (auth returnTo + уход с ?artist=). */
export function isAccountDeletedSessionActive(): boolean {
  return shouldForcePostAuthHome() || shouldLeaveDeletedArtistPage();
}

export function clearAccountDeletedSkipReturn(): void {
  try {
    sessionStorage.removeItem(ACCOUNT_DELETED_SKIP_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAccountDeletedLeaveArtist(): void {
  try {
    sessionStorage.removeItem(ACCOUNT_DELETED_LEAVE_ARTIST_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAccountDeletedSession(): void {
  clearAccountDeletedSkipReturn();
  clearAccountDeletedLeaveArtist();
}
