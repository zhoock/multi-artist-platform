import { useSyncExternalStore } from 'react';
import {
  type AuthUser,
  getAuthSessionIdentityKey,
  getAuthSessionUserSnapshot,
  subscribeAuthSession,
} from '@shared/lib/auth';

/**
 * То же хранилище, что у `getUser()`, но подписка на событие сессии —
 * нужно для данных дашборда после смены аккаунта без перезагрузки вкладки.
 * Snapshot — identity-ключ без purge: объект из JSON.parse нельзя отдавать в useSyncExternalStore.
 */
export function useAuthSessionUser(): AuthUser | null {
  const _sessionIdentityKey = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionIdentityKey,
    () => ''
  );
  void _sessionIdentityKey;
  return getAuthSessionUserSnapshot();
}
