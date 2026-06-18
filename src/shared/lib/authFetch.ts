/**
 * Обёртка над fetch для защищённых /api/*: синхронизация UI с 401 (истёкший JWT и т.д.).
 */
import {
  dispatchSessionExpiredRequest,
  isSessionExpiredHandlingPending,
  mapApiCodeToBannerReason,
  setSessionExpiredBannerReason,
  tryScheduleSessionExpiredHandling,
} from '@shared/lib/sessionExpired';
import { invalidateAuthSession } from './auth';

/** RTK rejectWithValue sentinel — session expiry owns user feedback. */
export const SESSION_INTERRUPTED = '__SESSION_INTERRUPTED__' as const;

const AUTH_PATH_SUBSTRINGS = ['/api/auth/login', '/api/auth/register'];

function isAuthLoginOrRegisterUrl(url: string): boolean {
  return AUTH_PATH_SUBSTRINGS.some((s) => url.includes(s));
}

/** Был ли в init явно передан Bearer (чтобы не редиректить по чужим 401, например оплата). */
export function requestInitSentBearerToken(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const h = init.headers;
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const a = h.get('Authorization') ?? h.get('authorization');
    return !!a && a.startsWith('Bearer ');
  }
  const rec = h as Record<string, string | undefined>;
  const a = rec.Authorization ?? rec.authorization;
  return !!a && String(a).startsWith('Bearer ');
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export async function readAuthApiErrorCode(response: Response): Promise<string | undefined> {
  try {
    const parsed = (await response.clone().json()) as { code?: string };
    return parsed?.code;
  } catch {
    return undefined;
  }
}

export function isSessionInvalidationErrorCode(
  code: string | undefined,
  hadBearer: boolean
): boolean {
  if (!hadBearer) return false;
  if (code === 'INVALID_CREDENTIALS') return false;
  return (
    code === 'SESSION_EXPIRED' ||
    code === 'INVALID_SESSION' ||
    code === 'UNAUTHORIZED' ||
    code === undefined
  );
}

/** True when a 401 should invalidate the session (same rules as fetchWithAuthSession). */
export async function isSessionInvalidationResponse(
  response: Response,
  init?: RequestInit
): Promise<boolean> {
  if (response.status !== 401) return false;
  const code = await readAuthApiErrorCode(response);
  return isSessionInvalidationErrorCode(code, requestInitSentBearerToken(init));
}

/**
 * Callers should skip error toasts / inline failure UI when true.
 * Session-expired auth overlay is the only user-facing feedback.
 */
export async function shouldSuppressApiErrorUi(
  response?: Response,
  init?: RequestInit
): Promise<boolean> {
  if (isSessionExpiredHandlingPending()) return true;
  if (!response) return false;
  return isSessionInvalidationResponse(response, init);
}

function handleSessionExpiration(code: string | undefined): void {
  if (typeof window === 'undefined') return;

  const reason = mapApiCodeToBannerReason(code);
  const onAuthPage = window.location.pathname.startsWith('/auth');

  if (!tryScheduleSessionExpiredHandling()) {
    return;
  }

  setSessionExpiredBannerReason(reason);
  invalidateAuthSession();
  dispatchSessionExpiredRequest({ reason, skipNavigation: onAuthPage });
}

/**
 * fetch + обработка 401 от кастомного JWT API.
 * Logout/redirect только если в запросе был Bearer и сервер отклонил сессию
 * (истёкший/невалидный JWT). 401 без токена — обычный unauthorized, сессию не трогаем.
 */
export async function fetchWithAuthSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status !== 401) {
    return response;
  }

  const url = resolveRequestUrl(input);
  if (isAuthLoginOrRegisterUrl(url)) {
    return response;
  }

  const code = await readAuthApiErrorCode(response);

  if (code === 'INVALID_CREDENTIALS') {
    return response;
  }

  if (!isSessionInvalidationErrorCode(code, requestInitSentBearerToken(init))) {
    return response;
  }

  handleSessionExpiration(code);

  return response;
}
