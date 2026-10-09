/**
 * Общие утилиты для Netlify Functions
 * Убирает дублирование кода между различными API endpoints
 */

import type { HandlerEvent } from '@netlify/functions';
import {
  classifyAuthorizationHeader,
  extractRoleFromToken,
  extractAccountTypeFromToken,
  type UserRole,
} from './jwt';
import { isArtistAccountType } from './account-type';
import { PublicArtistResolverError } from './public-artist-resolver';

/**
 * Стандартные CORS заголовки для всех API endpoints
 *
 * ВАЖНО: В продакшене лучше использовать конкретный домен вместо '*'
 * для избежания проблем с CORS при использовании Authorization header.
 * Например: 'Access-Control-Allow-Origin': 'https://smolyanoechuchelko.ru'
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  // Предотвращаем кэширование ответов API
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Стандартный ответ для OPTIONS запросов (preflight)
 */
export function createOptionsResponse() {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: '',
  };
}

/**
 * Стандартный ответ об ошибке
 */
export function createErrorResponse(
  statusCode: number,
  error: string,
  headers: Record<string, string> = CORS_HEADERS,
  meta?: {
    code?: string;
    details?: string;
    retryAfterSeconds?: number;
    subscriptionPaymentId?: string;
    confirmationUrl?: string;
  }
) {
  return {
    statusCode,
    headers,
    body: JSON.stringify({
      success: false,
      error,
      ...(meta?.code ? { code: meta.code } : {}),
      ...(meta?.details ? { details: meta.details } : {}),
      ...(meta?.retryAfterSeconds != null ? { retryAfterSeconds: meta.retryAfterSeconds } : {}),
      ...(meta?.subscriptionPaymentId ? { subscriptionPaymentId: meta.subscriptionPaymentId } : {}),
      ...(meta?.confirmationUrl ? { confirmationUrl: meta.confirmationUrl } : {}),
    }),
  };
}

/**
 * Стандартный успешный ответ
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200,
  headers: Record<string, string> = CORS_HEADERS
) {
  return {
    statusCode,
    headers,
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

/**
 * Стандартный успешный ответ с сообщением
 */
export function createSuccessMessageResponse(
  message: string,
  statusCode: number = 200,
  headers: Record<string, string> = CORS_HEADERS
) {
  return {
    statusCode,
    headers,
    body: JSON.stringify({
      success: true,
      message,
    }),
  };
}

/**
 * Валидация параметра языка
 */
export function validateLang(lang: string | undefined): lang is 'en' | 'ru' {
  return lang === 'en' || lang === 'ru';
}

/**
 * Значение Authorization (или эквивалент из Netlify clientContext) для verify.
 */
export function getAuthorizationHeaderFromEvent(event: HandlerEvent): string | undefined {
  const raw =
    (event.headers?.authorization as string | undefined) ||
    (event.headers?.Authorization as string | undefined);
  if (raw) {
    return raw;
  }
  const ctxToken = (event as any).clientContext?.user?.token as string | undefined;
  if (ctxToken && typeof ctxToken === 'string' && ctxToken.trim()) {
    return ctxToken.startsWith('Bearer ') ? ctxToken : `Bearer ${ctxToken}`;
  }
  return undefined;
}

/**
 * 401 с кодом для клиента: истёкший / невалидный JWT / нет заголовка.
 * Вызывать, когда requireAuth/getUserIdFromEvent вернули null.
 */
export function unauthorizedFromAuthHeader(event: HandlerEvent) {
  const auth = getAuthorizationHeaderFromEvent(event);
  const verdict = classifyAuthorizationHeader(auth);
  if (verdict.kind === 'none') {
    return createErrorResponse(401, 'Authentication required', CORS_HEADERS, {
      code: 'UNAUTHORIZED',
    });
  }
  if (verdict.kind === 'expired') {
    return createErrorResponse(401, 'Session expired. Please sign in again.', CORS_HEADERS, {
      code: 'SESSION_EXPIRED',
    });
  }
  return createErrorResponse(401, 'Invalid session. Please sign in again.', CORS_HEADERS, {
    code: 'INVALID_SESSION',
    details: verdict.kind === 'invalid' ? verdict.reason : undefined,
  });
}

/**
 * Извлекает user_id из Authorization header
 * Netlify может передавать заголовок в разных регистрах (authorization, Authorization)
 * Также проверяем clientContext для Identity функций
 * @returns user_id или null, если токен невалиден или отсутствует
 */
export function getUserIdFromEvent(event: HandlerEvent): string | null {
  const auth = getAuthorizationHeaderFromEvent(event);
  const verdict = classifyAuthorizationHeader(auth);
  return verdict.kind === 'valid' ? verdict.userId : null;
}

/**
 * Проверяет авторизацию пользователя
 * @returns user_id или null, если не авторизован
 */
export function requireAuth(event: HandlerEvent): string | null {
  const userId = getUserIdFromEvent(event);

  if (!userId) {
    // Детальное логирование для отладки проблем с авторизацией
    console.warn('⚠️ requireAuth: Authorization failed', {
      method: event.httpMethod,
      path: event.path,
      hasHeaders: !!event.headers,
      headerKeys: event.headers ? Object.keys(event.headers) : [],
      authorizationHeader:
        event.headers?.authorization || event.headers?.Authorization || 'not found',
      authorizationHeaderLength: (
        event.headers?.authorization ||
        event.headers?.Authorization ||
        ''
      ).length,
      clientContext: (event as any).clientContext ? 'present' : 'not present',
    });
  }

  return userId;
}

/**
 * Проверяет роль администратора по JWT (поле role, выдаётся при логине из БД).
 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Проверяет авторизацию и права админа
 * @returns userId если пользователь авторизован и является админом, null иначе
 */
export function requireAdmin(event: HandlerEvent): string | null {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    console.warn('⚠️ requireAdmin: Authorization failed - no userId');
    return null;
  }

  const auth =
    (event.headers?.authorization as string | undefined) ||
    (event.headers?.Authorization as string | undefined) ||
    ((event as any).clientContext?.user?.token as string | undefined);

  if (!auth) {
    console.warn('⚠️ requireAdmin: Authorization header not found');
    return null;
  }

  try {
    const role = extractRoleFromToken(auth);
    if (!isAdminRole(role)) {
      console.warn('⚠️ requireAdmin: User is not admin', { userId, role });
      return null;
    }
    return userId;
  } catch (error) {
    console.error('❌ Error checking admin status:', error);
    return null;
  }
}

/**
 * Только artist-аккаунт (или admin). Listener не может создавать/редактировать релизы и статьи.
 */
export function requireArtistAccount(event: HandlerEvent): string | null {
  const userId = requireAuth(event);
  if (!userId) return null;

  const auth =
    (event.headers?.authorization as string | undefined) ||
    (event.headers?.Authorization as string | undefined) ||
    undefined;

  const role = extractRoleFromToken(auth);
  if (isAdminRole(role)) return userId;

  const accountType = extractAccountTypeFromToken(auth);
  if (!isArtistAccountType(accountType)) {
    console.warn('⚠️ requireArtistAccount: listener account blocked', { userId, accountType });
    return null;
  }

  return userId;
}

export function forbiddenArtistAccountResponse(event: HandlerEvent) {
  return createErrorResponse(403, 'This action requires an artist account.', CORS_HEADERS, {
    code: 'ARTIST_ACCOUNT_REQUIRED',
  });
}

/**
 * Парсит JSON body с обработкой ошибок
 * @throws {Error} Если JSON невалиден, выбрасывает ошибку для возврата 400
 */
export function parseJsonBody<T>(body: string | null, defaultValue: T): T {
  if (!body) {
    return defaultValue;
  }
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error('❌ Failed to parse JSON body:', error);
    const errorMessage = error instanceof Error ? error.message : 'Invalid JSON';
    throw new Error(`Invalid JSON body: ${errorMessage}`);
  }
}

/**
 * Обработка ошибок с логированием
 */
export function handleError(
  error: unknown,
  context: string,
  defaultMessage: string = 'Unknown error'
): { statusCode: number; headers: Record<string, string>; body: string } {
  if (error instanceof PublicArtistResolverError) {
    return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
      code: error.code,
    });
  }

  const errorMessage = error instanceof Error ? error.message : defaultMessage;
  console.error(`❌ Error in ${context}:`, error);

  // Проверяем, является ли ошибка проблемой сетевого подключения
  const isNetworkError =
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('Connection terminated') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('MaxClientsInSessionMode');

  // Если это сетевая ошибка, возвращаем более понятное сообщение
  const userMessage = isNetworkError
    ? 'Database connection failed. This may be due to network restrictions. Please try using a VPN or check your network settings.'
    : errorMessage;

  return createErrorResponse(500, userMessage);
}
