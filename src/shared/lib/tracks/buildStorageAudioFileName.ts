/**
 * Имя файла аудио в Storage: `{trackId}__{slug-оригинала}.{ext}`
 * — стабильный UUID в начале + человекочитаемый хвост для отладки и бэкапов.
 */

const ALLOWED_AUDIO_EXT = /^(mp3|wav|flac|m4a|aac|ogg|opus|webm|wma|aif|aiff|mp4|oga|mp2|mp1)$/i;

export function safeAudioExtension(originalFileName: string): string {
  const raw = (originalFileName.split('.').pop() || 'mp3').toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]/g, '').slice(0, 12);
  return ALLOWED_AUDIO_EXT.test(cleaned) ? cleaned.toLowerCase() : 'mp3';
}

/** Базовое имя файла (без расширения) → безопасный ASCII-фрагмент для ключа в Storage. */
export function slugifyOriginalFileBaseForStorage(rawFileName: string, maxLen = 96): string {
  const withoutExt = rawFileName.replace(/\.[^/.]+$/, '').trim();
  const base = withoutExt || 'track';
  // Supabase signed upload rejects non-ASCII object keys — keep slug ASCII-only.
  let s = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  if (!s || /^[\d._-]+$/.test(s)) {
    return 'track';
  }
  return s;
}

export function buildStorageAudioFileName(
  trackId: string,
  originalFileName: string,
  options?: { extensionFromContent?: string | null }
): string {
  const fromContent = (options?.extensionFromContent || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
  const ext =
    fromContent && ALLOWED_AUDIO_EXT.test(fromContent)
      ? fromContent
      : safeAudioExtension(originalFileName);
  const slug = slugifyOriginalFileBaseForStorage(originalFileName, 96);
  return `${trackId}__${slug}.${ext}`;
}
