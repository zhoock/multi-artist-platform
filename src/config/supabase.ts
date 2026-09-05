/**
 * Конфигурация Supabase клиента
 *
 * Для работы нужны переменные окружения (см. документацию)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseUrl } from './supabaseStorageUrl';

type SafeEnv = Record<string, string | undefined>;

function getSafeEnv(): SafeEnv {
  const g = globalThis as unknown as { process?: { env?: SafeEnv } };
  return g.process?.env ?? {};
}

const getSupabaseAnonKey = (): string => {
  return process.env.VITE_SUPABASE_ANON_KEY || '';
};

const clientCache = new Map<string, SupabaseClient>();

export function createSupabaseClient(options?: { authToken?: string }): SupabaseClient | null {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    const env = getSafeEnv();
    if (env.NODE_ENV !== 'production') {
      console.warn('⚠️ Supabase credentials not found. Please set required environment variables.');
    }
    return null;
  }

  const cacheKey = options?.authToken
    ? `${supabaseUrl}:${supabaseAnonKey}:token:${options.authToken}`
    : `${supabaseUrl}:${supabaseAnonKey}:default`;

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

  if (options?.authToken) {
    clientOptions.auth = {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  if (options?.authToken) {
    void client.auth.setSession({
      access_token: options.authToken,
      refresh_token: '',
    });
  }

  clientCache.set(cacheKey, client);

  return client;
}

export const supabase = createSupabaseClient();

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
