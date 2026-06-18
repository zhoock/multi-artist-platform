/**
 * Клиентские утилиты для работы с аутентификацией
 */

import { clearPremiumCheckoutAuthIntent } from '@shared/lib/authIntent';
import { getLang } from '@shared/lib/lang';
import { getStore } from '@shared/model/appStore';
import { resetCatalogAfterAuthEnd } from '@shared/lib/resetCatalogAfterAuthEnd';
import { clearCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';
import { resetSessionExpiredHandlingState } from '@shared/lib/sessionExpired';

const TOKEN_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'auth_user';

/** @deprecated Import from `@shared/lib/sessionExpired` — kept for existing imports. */
export { AUTH_EXPIRED_BANNER_SESSION_KEY } from '@shared/lib/sessionExpired';

/** Допуск по часам клиента/серверу при проверке exp */
const JWT_EXP_LEEWAY_MS = 60_000;

/** Синхронизация UI после login/logout (localStorage `auth_user` в той же вкладке storage-событие не шлёт). */
export const AUTH_SESSION_CHANGED_EVENT = 'auth-session-changed';

function dispatchAuthSessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

type JwtPayloadUnsafe = {
  exp?: number;
  accountType?: string;
};

/** Декодирует payload JWT без проверки подписи (exp, accountType). */
function decodeJwtPayloadUnsafe(token: string): JwtPayloadUnsafe | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as JwtPayloadUnsafe;
  } catch {
    return null;
  }
}

function normalizeAccountTypeFromJwt(raw: unknown): AuthUser['accountType'] | null {
  if (raw === 'listener') return 'listener';
  if (raw === 'artist') return 'artist';
  return null;
}

/** accountType из JWT в localStorage (если auth_user без поля). */
export function readAccountTypeFromStoredToken(): AuthUser['accountType'] | null {
  const token = readRawTokenFromStorage();
  if (!token) return null;
  return normalizeAccountTypeFromJwt(decodeJwtPayloadUnsafe(token)?.accountType);
}

function enrichAuthUserFromToken(user: AuthUser, token: string): AuthUser {
  if (user.accountType === 'listener' || user.accountType === 'artist') {
    return user;
  }
  const accountType = normalizeAccountTypeFromJwt(decodeJwtPayloadUnsafe(token)?.accountType);
  return accountType ? { ...user, accountType } : user;
}

function readRawTokenFromStorage(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Токен существует, парсится и не просрочен по exp (или без exp — legacy). */
function isClientJwtStillValid(token: string): boolean {
  const payload = decodeJwtPayloadUnsafe(token);
  if (!payload) return false;
  if (typeof payload.exp !== 'number') {
    return true;
  }
  return payload.exp * 1000 > Date.now() - JWT_EXP_LEEWAY_MS;
}

/** Удаляет auth_user, если токена нет. */
function removeOrphanStoredUser(): void {
  try {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY) && localStorage.getItem(USER_STORAGE_KEY)) {
      localStorage.removeItem(USER_STORAGE_KEY);
      dispatchAuthSessionChanged();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Синхронизирует localStorage с истиной: истёкший/битый JWT и «сироты» auth_user очищаются.
 */
export function purgeInvalidAuthSessionFromStorage(): void {
  removeOrphanStoredUser();
  const raw = readRawTokenFromStorage();
  if (!raw) return;
  if (!isClientJwtStillValid(raw)) {
    clearAuth();
  }
}

/**
 * Подписка на смену аккаунта в этой вкладке (`saveAuth` / `clearAuth`) и в других (`storage`).
 * Нужна для `useSyncExternalStore`: при смене `auth_user` без полного перезагрузки React иначе
 * не перерисуется и эффекты с `userId` не сработают.
 */
export function subscribeAuthSession(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => callback();
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, run);
  const onStorage = (e: StorageEvent) => {
    if (e.key === USER_STORAGE_KEY || e.key === TOKEN_STORAGE_KEY || e.key === null) run();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, run);
    window.removeEventListener('storage', onStorage);
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  /** Роль с бэкенда; старые сессии могут не иметь поля */
  role?: 'user' | 'admin';
  /** listener | artist; старые сессии без поля — artist */
  accountType?: 'listener' | 'artist';
  /** Подтверждён ли email; старые сессии без поля считаются неподтверждёнными */
  isEmailVerified?: boolean;
  /** Язык UI и email-уведомлений */
  preferredLanguage?: 'ru' | 'en';
}

export interface AuthResponse {
  success: boolean;
  data?: {
    token: string;
    user: AuthUser;
  };
  error?: string;
  message?: string;
}

/**
 * Сохраняет токен и данные пользователя в localStorage
 */
export function saveAuth(token: string, user: AuthUser): void {
  try {
    const enrichedUser = enrichAuthUserFromToken(user, token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(enrichedUser));
    resetSessionExpiredHandlingState();
    dispatchAuthSessionChanged();
  } catch (error) {
    console.error('❌ Failed to save auth data:', error);
  }
}

/**
 * Получает токен из localStorage (после проверки срока действия / формы JWT).
 */
export function getToken(): string | null {
  try {
    purgeInvalidAuthSessionFromStorage();
    return readRawTokenFromStorage();
  } catch (error) {
    console.error('❌ Failed to get token:', error);
    return null;
  }
}

/**
 * Получает данные пользователя из localStorage
 */
export function getUser(): AuthUser | null {
  try {
    purgeInvalidAuthSessionFromStorage();
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    if (!userStr) return null;
    return JSON.parse(userStr) as AuthUser;
  } catch (error) {
    console.error('❌ Failed to get user:', error);
    return null;
  }
}

/** Стабильный ключ сессии для сравнения в `useSyncExternalStore` (смена id/email). */
export function getAuthSessionIdentityKey(): string {
  const u = getUser();
  if (!u) return '';
  return `${u.id}\0${u.email}`;
}

function authUserSnapshotEqual(a: AuthUser, b: AuthUser): boolean {
  return (
    a.id === b.id &&
    a.email === b.email &&
    (a.name ?? null) === (b.name ?? null) &&
    a.role === b.role &&
    a.accountType === b.accountType &&
    a.isEmailVerified === b.isEmailVerified &&
    a.preferredLanguage === b.preferredLanguage
  );
}

/**
 * Обновляет имя пользователя в localStorage (auth_user)
 */
export function updateStoredUserName(name: string | null): void {
  try {
    purgeInvalidAuthSessionFromStorage();
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    if (!userStr) return;
    const user = JSON.parse(userStr) as AuthUser;
    if (!user) return;
    const updatedUser: AuthUser = { ...user, name };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
  } catch (error) {
    console.error('❌ Failed to update stored user name:', error);
  }
}

/**
 * Сбрасывает просроченную/отклонённую сессию без logout-level teardown.
 * Не трогает Redux-каталог, dashboard modal background и checkout intents.
 */
export function invalidateAuthSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    clearCachedOwnPublicSlug();
    dispatchAuthSessionChanged();
  } catch (error) {
    console.error('❌ Failed to invalidate auth session:', error);
  }
}

/**
 * Полный выход / удаление аккаунта: invalidate + сброс каталога и checkout intents.
 */
export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    clearCachedOwnPublicSlug();
    clearPremiumCheckoutAuthIntent();
    try {
      resetCatalogAfterAuthEnd(getStore().dispatch);
    } catch {
      /* store may be unavailable in tests */
    }
    dispatchAuthSessionChanged();
  } catch (error) {
    console.error('❌ Failed to clear auth data:', error);
  }
}

/**
 * Проверяет, авторизован ли пользователь
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Регистрация нового пользователя
 */
export async function register(
  email: string,
  password: string,
  options?: {
    preferredLanguage?: string;
    accountType?: 'listener' | 'artist';
    /** Display name at signup (listener) or artist/band name (artist). */
    name?: string;
    /** @deprecated Use `name` */
    artistName?: string;
  }
): Promise<AuthResponse> {
  try {
    const accountType = options?.accountType ?? 'artist';
    const displayName = (options?.name || options?.artistName || '').trim();
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        accountType,
        ...(displayName
          ? {
              name: displayName,
              ...(accountType === 'artist' ? { siteName: displayName } : {}),
            }
          : {}),
        preferredLanguage: options?.preferredLanguage ?? getLang(),
      }),
    });

    const result: AuthResponse = await response.json();

    if (result.success && result.data) {
      saveAuth(result.data.token, result.data.user);
      if (displayName) {
        localStorage.setItem('profile-name', displayName);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Вход пользователя
 */
export async function login(
  email: string,
  password: string,
  options?: { preferredLanguage?: string }
): Promise<AuthResponse> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        preferredLanguage: options?.preferredLanguage ?? getLang(),
      }),
    });

    const result: AuthResponse = await response.json();

    if (result.success && result.data) {
      saveAuth(result.data.token, result.data.user);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Выход пользователя
 */
export function logout(): void {
  clearAuth();
}

/** Обновляет поля пользователя в localStorage (без смены токена). */
export function updateStoredUser(partial: Partial<AuthUser>): void {
  try {
    purgeInvalidAuthSessionFromStorage();
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    if (!userStr) return;
    const user = JSON.parse(userStr) as AuthUser;
    const updatedUser: AuthUser = { ...user, ...partial };
    if (authUserSnapshotEqual(user, updatedUser)) return;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
    dispatchAuthSessionChanged();
  } catch (error) {
    console.error('❌ Failed to update stored user:', error);
  }
}

export function isEmailVerified(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.isEmailVerified === true;
}

/** Сохраняет preferred_language на бэкенде для email-уведомлений. */
export async function syncPreferredLanguage(lang: string): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    await fetch('/api/auth/preferred-language', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferredLanguage: lang }),
    });
  } catch (error) {
    console.error('❌ Failed to sync preferred language:', error);
  }
}

/**
 * Загружает актуальный профиль с бэкенда и обновляет localStorage.
 */
export async function refreshAuthSession(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    void syncPreferredLanguage(getLang());

    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json();
    if (result.success && result.data?.user) {
      const user = result.data.user as AuthUser;
      updateStoredUser(user);
      return user;
    }
  } catch (error) {
    console.error('❌ Failed to refresh auth session:', error);
  }
  return getUser();
}

export async function resendVerificationEmail(): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    });
    const result = await response.json();
    return {
      success: Boolean(result.success),
      error: result.error,
      code: result.code,
      retryAfterSeconds:
        typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function changeVerificationEmail(email: string): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  user?: AuthUser;
}> {
  try {
    const response = await fetch('/api/auth/change-verification-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (result.success && result.data?.user) {
      if (result.data.token) {
        saveAuth(result.data.token, result.data.user);
      } else {
        updateStoredUser(result.data.user);
      }
      return { success: true, user: result.data.user };
    }
    return {
      success: false,
      error: result.error,
      code: result.code,
      retryAfterSeconds:
        typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upgrades listener account to artist (one-way). Returns fresh JWT and user.
 */
export async function upgradeToArtistAccount(artistName: string): Promise<AuthResponse> {
  const trimmed = artistName.trim();
  if (!trimmed) {
    return { success: false, error: 'Artist / band name is required' };
  }

  try {
    const response = await fetch('/api/auth/upgrade-to-artist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ artistName: trimmed }),
    });

    const result: AuthResponse = await response.json();

    if (result.success && result.data) {
      saveAuth(result.data.token, result.data.user);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('artist:updated'));
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Безвозвратно удаляет аккаунт текущего пользователя.
 */
export async function deleteAccount(
  currentPassword: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const response = await fetch('/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ currentPassword }),
    });

    const result = await response.json();
    return {
      success: Boolean(result.success),
      error: result.error,
      code: result.code,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Запрашивает письмо со ссылкой для сброса пароля.
 *
 * Бэкенд всегда возвращает одинаковый нейтральный ответ независимо от того,
 * существует ли email в системе — это исключает email enumeration. Клиент
 * всегда показывает один и тот же success-state «If an account with this
 * email exists, we sent a password reset link.»
 */
export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    return {
      success: Boolean(result.success),
      message: result.data?.message,
      error: result.error,
      code: result.code,
      retryAfterSeconds:
        typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Завершает сброс пароля: одноразовый токен из email + новый пароль.
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: newPassword }),
    });
    const result = await response.json();
    return {
      success: Boolean(result.success),
      error: result.error,
      code: result.code,
      retryAfterSeconds:
        typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Получает заголовок Authorization для API запросов
 */
export function getAuthHeader(): { Authorization: string } | {} {
  const token = getToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}
