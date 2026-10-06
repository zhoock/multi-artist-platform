// src/shared/lib/hooks/useAvatar.ts
/**
 * Хук для работы с аватаром пользователя
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getUser, AUTH_SESSION_CHANGED_EVENT } from '@shared/lib/auth';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  appendUrlCacheBustParam,
  DEFAULT_PROFILE_AVATAR_URL,
  getProfileAvatarLocalStorageKey,
  isProfileAvatarPlaceholderUrl,
  profileAvatarRetinaUrlFrom1x,
  PROFILE_AVATAR_LOCALSTORAGE_KEY,
} from '@shared/lib/avatarUpload';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';
import { deleteProfileAvatarFromServer, uploadFile } from '@shared/api/storage';
import {
  profileAvatarPathToDisplayUrl,
  getResolvedProfileAvatarStoragePath,
  invalidateProfileAvatarSession,
  refreshProfileAvatarFromServer,
  subscribeProfileAvatarSession,
  isProfileAvatarSessionReady,
} from '@shared/lib/profileAvatar';

/** @deprecated Импортируйте из `@shared/lib/avatarUpload`. */
export {
  getProfileAvatarLocalStorageKey,
  PROFILE_AVATAR_LOCALSTORAGE_KEY,
} from '@shared/lib/avatarUpload';

const DEFAULT_AVATAR = DEFAULT_PROFILE_AVATAR_URL;

function normalizeAvatarUrl(url: string | null): string {
  if (!url || isProfileAvatarPlaceholderUrl(url)) {
    return DEFAULT_AVATAR;
  }
  return url;
}

/** Событие после смены URL аватара (для синхронизации шапки и т.п.) */
export const PROFILE_AVATAR_CHANGED_EVENT = 'profile-avatar-changed';

function dispatchProfileAvatarChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROFILE_AVATAR_CHANGED_EVENT));
}

function readAvatarUrlFromStorageForKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('Failed to read avatar URL from localStorage:', error);
    return null;
  }
}

function resolveDisplayUrlFromServerOrCache(): string {
  const path = getResolvedProfileAvatarStoragePath();
  if (path !== undefined) {
    return profileAvatarPathToDisplayUrl(path);
  }

  const key = getUser()?.id ? getProfileAvatarLocalStorageKey(getUser()!.id) : null;
  if (key) {
    const cached = readAvatarUrlFromStorageForKey(key);
    if (cached) {
      return normalizeAvatarUrl(cached);
    }
  }
  return DEFAULT_AVATAR;
}

export function getStoredProfileAvatarUrl(): string {
  return resolveDisplayUrlFromServerOrCache();
}

/** Первая буква имени или email для пустого аватара. */
export function getProfileAvatarInitials(): string {
  const user = getUser();
  const source = (user?.name?.trim() || user?.email?.trim() || '').trim();
  if (!source) return '?';
  return [...source][0]?.toUpperCase() ?? '?';
}

/**
 * URL аватара с подпиской на server-side profile path и смену сессии.
 */
export function useStoredProfileAvatarUrl(): string {
  const location = useLocation();
  const [src, setSrc] = useState(resolveDisplayUrlFromServerOrCache);

  const sync = useCallback(() => {
    setSrc(resolveDisplayUrlFromServerOrCache());
  }, []);

  useEffect(() => {
    void refreshProfileAvatarFromServer().then(sync);
  }, [sync]);

  useEffect(() => {
    sync();
  }, [location.pathname, location.key, sync]);

  useEffect(() => {
    return subscribeProfileAvatarSession(sync);
  }, [sync]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const userId = getUser()?.id;
      const cur = userId ? getProfileAvatarLocalStorageKey(userId) : null;
      if (
        e.key === null ||
        (cur && e.key === cur) ||
        e.key?.startsWith('user-avatar-url:') ||
        e.key === PROFILE_AVATAR_LOCALSTORAGE_KEY
      ) {
        if (!isProfileAvatarSessionReady()) {
          sync();
        }
      }
    };
    const onSession = () => {
      invalidateProfileAvatarSession();
      void refreshProfileAvatarFromServer().then(sync);
    };
    const onAvatarChanged = () => sync();

    window.addEventListener('storage', onStorage);
    window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, onAvatarChanged);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PROFILE_AVATAR_CHANGED_EVENT, onAvatarChanged);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    };
  }, [sync]);

  return src;
}

const DEFAULT_FILE_TOO_LARGE_MSG =
  'The image is too large. Maximum file size is 2 MB. Choose a smaller file.';

export type AvatarAlertVariant = 'error' | 'warning';

export type UseAvatarOptions = {
  avatarFileTooLargeMessage?: string;
  onAvatarAlert?: (options: { message: string; variant?: AvatarAlertVariant }) => void;
};

export function useAvatar(options?: UseAvatarOptions) {
  const { onAvatarAlert } = options ?? {};
  const fileTooLargeMessage = options?.avatarFileTooLargeMessage ?? DEFAULT_FILE_TOO_LARGE_MSG;

  const showAvatarAlert = useCallback(
    (message: string, variant: AvatarAlertVariant = 'error') => {
      if (onAvatarAlert) {
        onAvatarAlert({ message, variant });
        return;
      }
      console.error(message);
    },
    [onAvatarAlert]
  );

  const [avatarSrc, setAvatarSrc] = useState<string>(() => {
    const base = resolveDisplayUrlFromServerOrCache();
    if (isProfileAvatarPlaceholderUrl(base)) {
      return DEFAULT_AVATAR;
    }
    const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return appendUrlCacheBustParam(base, bust);
  });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const applyResolvedDisplayUrl = useCallback((withCacheBust: boolean) => {
    const display = resolveDisplayUrlFromServerOrCache();
    if (isProfileAvatarPlaceholderUrl(display)) {
      setAvatarSrc(DEFAULT_AVATAR);
      return;
    }
    if (withCacheBust) {
      const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setAvatarSrc(appendUrlCacheBustParam(display, bust));
    } else {
      setAvatarSrc(display);
    }
  }, []);

  useEffect(() => {
    void refreshProfileAvatarFromServer().then(() => applyResolvedDisplayUrl(false));
  }, [applyResolvedDisplayUrl]);

  useEffect(() => {
    return subscribeProfileAvatarSession(() => applyResolvedDisplayUrl(false));
  }, [applyResolvedDisplayUrl]);

  useEffect(() => {
    const onSession = () => {
      try {
        if (localStorage.getItem(PROFILE_AVATAR_LOCALSTORAGE_KEY)) {
          localStorage.removeItem(PROFILE_AVATAR_LOCALSTORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
      invalidateProfileAvatarSession();
      void refreshProfileAvatarFromServer().then(() => applyResolvedDisplayUrl(false));
    };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
  }, [applyResolvedDisplayUrl]);

  const handleAvatarClick = useCallback(() => {
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  }, [isUploadingAvatar]);

  const handleAvatarRemove = useCallback(async () => {
    if (isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    try {
      const key = getUser()?.id ? getProfileAvatarLocalStorageKey(getUser()!.id) : null;
      const ok = await deleteProfileAvatarFromServer();
      if (!ok) {
        showAvatarAlert(
          'Не удалось удалить фото. Проверьте подключение к сети и повторите попытку.'
        );
        return;
      }
      if (key) {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn('Failed to clear avatar from localStorage:', error);
        }
      }
      invalidateProfileAvatarSession();
      await refreshProfileAvatarFromServer();
      const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setAvatarSrc(appendUrlCacheBustParam(DEFAULT_AVATAR, bust));
      dispatchProfileAvatarChanged();
    } catch (error) {
      console.error('Failed to remove avatar:', error);
      showAvatarAlert(
        error instanceof Error
          ? `Не удалось удалить фото: ${error.message}`
          : 'Не удалось удалить фото. Повторите попытку.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [isUploadingAvatar, showAvatarAlert]);

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
        showAvatarAlert(fileTooLargeMessage, 'warning');
        e.target.value = '';
        return;
      }

      setIsUploadingAvatar(true);
      try {
        let fileExtension = '.jpg';
        if (file.type) {
          if (file.type === 'image/png') {
            fileExtension = '.png';
          } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            fileExtension = '.jpg';
          } else if (file.type === 'image/webp') {
            fileExtension = '.webp';
          } else {
            const nameMatch = file.name.match(/\.([a-z0-9]+)$/i);
            if (nameMatch) {
              fileExtension = `.${nameMatch[1].toLowerCase()}`;
            }
          }
        }

        const fileName = `profile${fileExtension}`;

        const result = await uploadFile({
          category: 'profile',
          file,
          fileName,
          upsert: true,
        });

        if (!result) {
          console.error('Upload failed: result is null');
          showAvatarAlert('Не удалось загрузить аватар. Повторите попытку.');
          return;
        }

        let displayUrl = result;
        if (displayUrl.startsWith('users/') && displayUrl.includes('/profile/')) {
          displayUrl = profileAvatarPathToDisplayUrl(displayUrl);
        } else if (
          !displayUrl.startsWith('http') &&
          !displayUrl.startsWith('/') &&
          displayUrl.startsWith('users/')
        ) {
          displayUrl = buildProxyImageUrlFromStoragePath(displayUrl);
        }
        if (!displayUrl.startsWith('http') && !displayUrl.startsWith('/')) {
          console.error('Invalid URL returned:', result, '->', displayUrl);
          showAvatarAlert('Не удалось обработать загруженное изображение. Повторите попытку.');
          return;
        }

        invalidateProfileAvatarSession();
        await refreshProfileAvatarFromServer();

        const resolved = resolveDisplayUrlFromServerOrCache();
        const finalDisplay = !isProfileAvatarPlaceholderUrl(resolved) ? resolved : displayUrl;

        const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const avatarUrl = appendUrlCacheBustParam(finalDisplay, bust);

        const preloadImg = new Image();
        await new Promise<void>((resolve) => {
          preloadImg.onload = () => resolve();
          preloadImg.onerror = () => resolve();
          preloadImg.src = avatarUrl;
        });

        const storageKey = getUser()?.id ? getProfileAvatarLocalStorageKey(getUser()!.id) : null;
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, finalDisplay);
            if (localStorage.getItem(PROFILE_AVATAR_LOCALSTORAGE_KEY)) {
              localStorage.removeItem(PROFILE_AVATAR_LOCALSTORAGE_KEY);
            }
          } catch (error) {
            console.warn('Failed to save avatar URL to localStorage:', error);
          }
        }

        setAvatarSrc(avatarUrl);
        dispatchProfileAvatarChanged();
      } catch (error) {
        console.error('❌ Error uploading avatar:', error);
        showAvatarAlert(
          error instanceof Error
            ? `Не удалось загрузить аватар: ${error.message}`
            : 'Не удалось загрузить аватар. Повторите попытку.'
        );
      } finally {
        setIsUploadingAvatar(false);
        if (avatarInputRef.current) {
          avatarInputRef.current.value = '';
        }
      }
    },
    [fileTooLargeMessage, showAvatarAlert]
  );

  const avatarRetinaSrc = useMemo(() => profileAvatarRetinaUrlFrom1x(avatarSrc), [avatarSrc]);

  return {
    avatarSrc,
    avatarRetinaSrc,
    isUploadingAvatar,
    avatarInputRef,
    handleAvatarClick,
    handleAvatarChange,
    handleAvatarRemove,
  };
}
