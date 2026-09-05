/**
 * Lightweight Supabase Storage URL helpers — no @supabase/supabase-js import.
 * Use for public CDN URLs and Hero/album cover URL building on the critical path.
 */

/** Имя бакета для хранения медиа-файлов пользователей (изображения и аудио) */
export const STORAGE_BUCKET_NAME = 'user-media';

/**
 * VITE_SUPABASE_URL (client) or SUPABASE_URL (server scripts).
 * Webpack DefinePlugin inlines process.env.VITE_* at build time.
 */
export function getSupabaseUrl(): string {
  const viteUrl = process.env.VITE_SUPABASE_URL || '';
  if (viteUrl) return viteUrl;
  if (typeof process !== 'undefined' && process.env?.SUPABASE_URL) {
    return process.env.SUPABASE_URL;
  }
  return '';
}

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
