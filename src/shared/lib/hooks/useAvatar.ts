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
  isProfileAvatarPlaceholderUrl,
  profileAvatarRetinaUrlFrom1x,
} from '@shared/lib/avatarUpload';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';
import { deleteProfileAvatarFromServer, uploadFile } from '@shared/api/storage';

/** @deprecated Старый глобальный ключ — кэш был общий для всех аккаунтов; не использовать для чтения. */
export const PROFILE_AVATAR_LOCALSTORAGE_KEY = 'user-avatar-url';

const PROFILE_AVATAR_KEY_PREFIX = 'user-avatar-url:';

export function getProfileAvatarLocalStorageKey(userId: string): string {
  return `${PROFILE_AVATAR_KEY_PREFIX}${userId}`;
}

function getAvatarKeyForCurrentUser(): string | null {
  const id = getUser()?.id;
  return id ? getProfileAvatarLocalStorageKey(id) : null;
}

const DEFAULT_AVATAR = DEFAULT_PROFILE_AVATAR_URL;

function normalizeAvatarUrl(url: string | null): string {
  if (!url || isProfileAvatarPlaceholderUrl(url)) {
    return DEFAULT_AVATAR;
  }
  return url;
}

/** Событие после смены URL аватара в localStorage (для синхронизации шапки и т.п.) */
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

export function getStoredProfileAvatarUrl(): string {
  const key = getAvatarKeyForCurrentUser();
  if (!key) {
    return DEFAULT_AVATAR;
  }
  const savedUrl = readAvatarUrlFromStorageForKey(key);
  if (savedUrl) {
    return normalizeAvatarUrl(savedUrl);
  }
  return DEFAULT_AVATAR;
}

/** Первая буква имени или email для пустого аватара. */
export function getProfileAvatarInitials(): string {
  const user = getUser();
  const source = (user?.name?.trim() || user?.email?.trim() || '').trim();
  if (!source) return '?';
  return [...source][0]?.toUpperCase() ?? '?';
}

/**
 * URL аватара из localStorage с подпиской на смену (шапка, главная сцена и т.д.).
 */
export function useStoredProfileAvatarUrl(): string {
  const location = useLocation();
  const [src, setSrc] = useState(getStoredProfileAvatarUrl);
  const sync = useCallback(() => {
    setSrc(getStoredProfileAvatarUrl());
  }, []);

  useEffect(() => {
    sync();
  }, [location.pathname, location.key, sync]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const cur = getAvatarKeyForCurrentUser();
      if (
        e.key === null ||
        (cur && e.key === cur) ||
        e.key?.startsWith(PROFILE_AVATAR_KEY_PREFIX) ||
        e.key === PROFILE_AVATAR_LOCALSTORAGE_KEY
      ) {
        sync();
      }
    };
    const onSession = () => {
      sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, sync);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PROFILE_AVATAR_CHANGED_EVENT, sync);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    };
  }, [sync]);

  return src;
}

const DEFAULT_FILE_TOO_LARGE_MSG =
  'The image is too large. Maximum file size is 2 MB. Choose a smaller file.';

export type AvatarAlertVariant = 'error' | 'warning';

export type UseAvatarOptions = {
  /** Сообщение при превышении лимита (из UI-словаря) */
  avatarFileTooLargeMessage?: string;
  /** Показать уведомление (AlertModal в дашборде). Без callback — только console.error. */
  onAvatarAlert?: (options: { message: string; variant?: AvatarAlertVariant }) => void;
};

/**
 * Хук для управления аватаром пользователя
 * @returns Объект с состоянием и функциями для работы с аватаром
 */
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
    try {
      const key = getAvatarKeyForCurrentUser();
      if (!key) {
        return DEFAULT_AVATAR;
      }
      const savedUrl = readAvatarUrlFromStorageForKey(key);
      if (savedUrl) {
        const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        return appendUrlCacheBustParam(normalizeAvatarUrl(savedUrl), bust);
      }
    } catch (error) {
      console.warn('Failed to load avatar URL from localStorage:', error);
    }
    return DEFAULT_AVATAR;
  });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onSession = () => {
      try {
        if (localStorage.getItem(PROFILE_AVATAR_LOCALSTORAGE_KEY)) {
          localStorage.removeItem(PROFILE_AVATAR_LOCALSTORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
      const key = getAvatarKeyForCurrentUser();
      if (!key) {
        setAvatarSrc(DEFAULT_AVATAR);
        return;
      }
      const savedUrl = readAvatarUrlFromStorageForKey(key);
      if (savedUrl) {
        const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        setAvatarSrc(appendUrlCacheBustParam(normalizeAvatarUrl(savedUrl), bust));
      } else {
        setAvatarSrc(DEFAULT_AVATAR);
      }
    };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
  }, []);

  const handleAvatarClick = useCallback(() => {
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  }, [isUploadingAvatar]);

  const handleAvatarRemove = useCallback(async () => {
    if (isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    try {
      const key = getAvatarKeyForCurrentUser();
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
        // Определяем расширение файла из MIME типа или имени файла
        let fileExtension = '.jpg'; // По умолчанию
        if (file.type) {
          if (file.type === 'image/png') {
            fileExtension = '.png';
          } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            fileExtension = '.jpg';
          } else if (file.type === 'image/webp') {
            fileExtension = '.webp';
          } else {
            // Пытаемся определить из имени файла
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

        // API может вернуть storagePath `users/.../profile/...` — в браузер нужен proxy URL
        let displayUrl = result;
        if (
          !displayUrl.startsWith('http') &&
          displayUrl.startsWith('users/') &&
          displayUrl.includes('/profile/')
        ) {
          displayUrl = buildProxyImageUrlFromStoragePath(displayUrl);
        }
        if (!displayUrl.startsWith('http')) {
          console.error('Invalid URL returned:', result, '->', displayUrl);
          showAvatarAlert('Не удалось обработать загруженное изображение. Повторите попытку.');
          return;
        }

        // Используем URL, который вернула функция uploadFile (публичный URL из Supabase Storage)
        // Добавляем агрессивный cache-bust для принудительного обновления изображения
        const bust = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const avatarUrl = appendUrlCacheBustParam(displayUrl, bust);

        // Предзагружаем новое изображение перед обновлением состояния
        const preloadImg = new Image();

        await new Promise<void>((resolve) => {
          preloadImg.onload = () => {
            resolve();
          };
          preloadImg.onerror = () => {
            console.warn('⚠️ Failed to preload new avatar, but will try to display it anyway');
            resolve();
          };
          preloadImg.src = avatarUrl;
        });

        const storageKey = getAvatarKeyForCurrentUser();
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, displayUrl);
            if (localStorage.getItem(PROFILE_AVATAR_LOCALSTORAGE_KEY)) {
              localStorage.removeItem(PROFILE_AVATAR_LOCALSTORAGE_KEY);
            }
          } catch (error) {
            console.warn('Failed to save avatar URL to localStorage:', error);
          }
        }

        // Обновляем состояние только после предзагрузки
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
