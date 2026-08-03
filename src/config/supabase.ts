/**
 * Конфигурация Supabase клиента
 *
 * Для работы нужны переменные окружения (см. документацию)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SafeEnv = Record<string, string | undefined>;

function getSafeEnv(): SafeEnv {
  const g = globalThis as unknown as { process?: { env?: SafeEnv } };
  // Только process.env: в бандле Webpack DefinePlugin подставляет VITE_* (см. webpack.common.js).
  // import.meta здесь не использовать — в non-ESM чанках это даёт SyntaxError.
  return g.process?.env ?? {};
}

// Получаем URL и ключ из переменных окружения
// Для клиентской части (React) используем VITE_ префикс
// Для серверной части (Netlify Functions) используем без префикса
//
// ВАЖНО: Webpack DefinePlugin заменяет каждое `process.env.VITE_*` на строковый литерал при сборке.
// Нельзя делать `if (!process) return` до чтения VITE_*: в браузере без node polyfill `process`
// отсутствует, и функция всегда возвращала бы пустую строку.
const getSupabaseUrl = (): string => {
  const viteUrl = process.env.VITE_SUPABASE_URL || '';
  if (viteUrl) return viteUrl;
  if (typeof process !== 'undefined' && process.env?.SUPABASE_URL) {
    return process.env.SUPABASE_URL;
  }
  return '';
};

const getSupabaseAnonKey = (): string => {
  return process.env.VITE_SUPABASE_ANON_KEY || '';
};

// Кеш для клиентов Supabase (singleton pattern)
// Ключ - это строка, представляющая конфигурацию клиента (URL + ключ + authToken)
const clientCache = new Map<string, SupabaseClient>();

/**
 * Создает и возвращает Supabase клиент
 * Использует singleton pattern для предотвращения создания множественных экземпляров
 * @param options - опции для создания клиента (например, auth token)
 * @returns Supabase клиент или null, если переменные окружения не установлены
 */
export function createSupabaseClient(options?: { authToken?: string }): SupabaseClient | null {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  // Проверяем наличие переменных окружения
  if (!supabaseUrl || !supabaseAnonKey) {
    const env = getSafeEnv();
    if (env.NODE_ENV !== 'production') {
      console.warn('⚠️ Supabase credentials not found. Please set required environment variables.');
    }
    // Возвращаем null вместо создания клиента с пустыми значениями
    return null;
  }

  // Создаем ключ для кеша на основе конфигурации
  // Для клиентов с authToken создаем отдельные экземпляры
  const cacheKey = options?.authToken
    ? `${supabaseUrl}:${supabaseAnonKey}:token:${options.authToken}`
    : `${supabaseUrl}:${supabaseAnonKey}:default`;

  // Проверяем, есть ли уже клиент в кеше
  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const clientOptions: {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
      detectSessionInUrl?: boolean;
    };
  } = {};

  // Если передан токен авторизации, используем его
  if (options?.authToken) {
    clientOptions.auth = {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  // Устанавливаем токен авторизации, если передан
  if (options?.authToken) {
    void client.auth.setSession({
      access_token: options.authToken,
      refresh_token: '',
    });
  }

  // Сохраняем клиент в кеш
  clientCache.set(cacheKey, client);

  return client;
}

/**
 * Дефолтный Supabase клиент для использования в приложении
 * Может быть null, если переменные окружения не установлены
 */
export const supabase = createSupabaseClient();

/**
 * Создает Supabase клиент с service role key (обходит RLS политики)
 * ⚠️ ВАЖНО: Использовать ТОЛЬКО на сервере/в скриптах, НИКОГДА на клиенте!
 * @returns Supabase клиент с service role key или null, если переменные не установлены
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('Service role key cannot be used in the browser');
  }

  const env = getSafeEnv();
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    if (env.NODE_ENV !== 'production') {
      console.warn(
        '⚠️ Supabase service role key not found. Set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL) on the server only — never VITE_*.'
      );
    }
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Имя бакета для хранения медиа-файлов пользователей (изображения и аудио)
 */
export const STORAGE_BUCKET_NAME = 'user-media';

/**
 * Публичный URL объекта в Storage без создания клиента (достаточно VITE_SUPABASE_URL).
 * Путь — относительно bucket, например users/{uuid}/audio/album/file.mp3
 */
export function buildStoragePublicObjectUrl(storagePath: string): string | null {
  const base = getSupabaseUrl().replace(/\/$/, '');
  if (!base) {
    console.error('❌ Missing Supabase URL (VITE_SUPABASE_URL or SUPABASE_URL)');
    return null;
  }
  const cleanPath = storagePath.replace(/^\/+/, '');
  const storageApiBase = `${base}/storage/v1`;
  return encodeURI(`${storageApiBase}/object/public/${STORAGE_BUCKET_NAME}/${cleanPath}`);
}

let supabaseClientConfigLogged = false;

function logSupabaseClientConfigOnce(): void {
  if (typeof window === 'undefined' || supabaseClientConfigLogged) {
    return;
  }
  supabaseClientConfigLogged = true;

  const hasUrl = !!getSupabaseUrl();
  const hasAnonKey = !!getSupabaseAnonKey();

  const env = getSafeEnv();
  if (env.NODE_ENV !== 'production' && (!hasUrl || !hasAnonKey)) {
    console.warn(
      '⚠️ Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (шаблон: .env.example), затем перезапустите dev-сервер. Без URL публичные ссылки на треки подставятся как storagePath.'
    );
  }
}

logSupabaseClientConfigOnce();
