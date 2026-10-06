import { AUTH_SESSION_CHANGED_EVENT, getUser } from '@shared/lib/auth';
import { getProfileAvatarLocalStorageKey } from '@shared/lib/avatarUpload';
import { fetchOwnProfileAvatarPath } from './fetchOwnProfileAvatarPath';
import { profileAvatarPathToDisplayUrl } from './profileAvatarDisplay';

type Listener = () => void;

let serverStoragePath: string | null | undefined = undefined;
let inflight: Promise<string | null> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** `undefined` — server value not loaded yet. */
export function getResolvedProfileAvatarStoragePath(): string | null | undefined {
  return serverStoragePath;
}

export function isProfileAvatarSessionReady(): boolean {
  return serverStoragePath !== undefined;
}

export function getResolvedProfileAvatarDisplayUrl(): string {
  const path = getResolvedProfileAvatarStoragePath();
  if (path === undefined) {
    return profileAvatarPathToDisplayUrl(null);
  }
  return profileAvatarPathToDisplayUrl(path);
}

export function subscribeProfileAvatarSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeDisplayUrlCache(userId: string, displayUrl: string): void {
  const key = getProfileAvatarLocalStorageKey(userId);
  try {
    if (!displayUrl) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, displayUrl);
  } catch {
    /* ignore */
  }
}

export function invalidateProfileAvatarSession(): void {
  serverStoragePath = undefined;
  inflight = null;
  notify();
}

export async function refreshProfileAvatarFromServer(lang?: string): Promise<string | null> {
  const userId = getUser()?.id;
  if (!userId) {
    serverStoragePath = null;
    inflight = null;
    notify();
    return null;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const path = await fetchOwnProfileAvatarPath(lang);
      serverStoragePath = path;
      writeDisplayUrlCache(userId, profileAvatarPathToDisplayUrl(path));
      return path;
    } catch {
      serverStoragePath = null;
      return null;
    } finally {
      inflight = null;
      notify();
    }
  })();

  return inflight;
}

export function ensureProfileAvatarSessionListener(): void {
  if (typeof window === 'undefined') return;
  if ((ensureProfileAvatarSessionListener as { installed?: boolean }).installed) return;
  (ensureProfileAvatarSessionListener as { installed?: boolean }).installed = true;

  const onSession = () => {
    invalidateProfileAvatarSession();
    void refreshProfileAvatarFromServer();
  };

  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
}

ensureProfileAvatarSessionListener();
