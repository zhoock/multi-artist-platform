/**
 * Temporary auth intent: resume album checkout after guest sign in / sign up.
 *
 * Зачем: ownership альбома реально хранится на сервере (`purchases.user_id`),
 * но чтобы UI после refresh показал "Owned", нужен авторизованный viewer.
 * Чтобы покупка не разрывалась на "вышел из YooKassa → снова Buy Album",
 * мы блокируем гостя ДО checkout, требуем sign in / sign up, а потом
 * автоматически возвращаем его на album page и переоткрываем checkout-модал.
 *
 * Зеркалит `premiumCheckoutIntent.ts`: тот же паттерн, но на конкретный альбом.
 */
import { sanitizeReturnPath, readReturnPathFromWindow } from '@shared/lib/authReturnUrl';

export const ALBUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY = 'sc_album_checkout_auth_intent';
export const ALBUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG = 'sc_album_checkout_resume_after_auth';
export const ALBUM_CHECKOUT_PENDING_KEY_STORAGE_KEY = 'sc_album_checkout_pending_open_key';

const INTENT_TTL_MS = 30 * 60 * 1000;

export type AlbumCheckoutAuthIntent = {
  type: 'album_checkout';
  albumKey: string;
  dbAlbumId: string;
  returnTo: string;
  createdAt: number;
};

export type AlbumCheckoutIntentContext = {
  albumKey: string;
  dbAlbumId?: string | null;
  returnTo?: string | null;
};

function readCurrentReturnPath(): string {
  return readReturnPathFromWindow();
}

export function buildAlbumCheckoutIntentContext(
  context: AlbumCheckoutIntentContext
): AlbumCheckoutAuthIntent {
  const albumKey = context.albumKey.trim();
  const dbAlbumId = context.dbAlbumId?.trim() ?? '';
  const returnTo = sanitizeReturnPath(context.returnTo?.trim() || readCurrentReturnPath()) ?? '/';

  return {
    type: 'album_checkout',
    albumKey,
    dbAlbumId,
    returnTo,
    createdAt: Date.now(),
  };
}

export function saveAlbumCheckoutAuthIntent(
  context: AlbumCheckoutIntentContext
): AlbumCheckoutAuthIntent {
  const intent = buildAlbumCheckoutIntentContext(context);
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(ALBUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY, JSON.stringify(intent));
    } catch {
      /* ignore quota */
    }
  }
  return intent;
}

export function markAlbumCheckoutResumeAfterAuth(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ALBUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function shouldResumeAlbumCheckoutAfterAuth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(ALBUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG) === '1';
  } catch {
    return false;
  }
}

export function clearAlbumCheckoutResumeAfterAuthFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ALBUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

export function readAlbumCheckoutAuthIntent(): AlbumCheckoutAuthIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ALBUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AlbumCheckoutAuthIntent>;
    if (
      parsed.type !== 'album_checkout' ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.albumKey !== 'string' ||
      !parsed.albumKey.trim()
    ) {
      clearAlbumCheckoutAuthIntent();
      return null;
    }
    if (Date.now() - parsed.createdAt > INTENT_TTL_MS) {
      clearAlbumCheckoutAuthIntent();
      return null;
    }
    const returnTo = sanitizeReturnPath(parsed.returnTo ?? null) ?? '/';
    return {
      type: 'album_checkout',
      albumKey: parsed.albumKey.trim(),
      dbAlbumId: typeof parsed.dbAlbumId === 'string' ? parsed.dbAlbumId.trim() : '',
      returnTo,
      createdAt: parsed.createdAt,
    };
  } catch {
    clearAlbumCheckoutAuthIntent();
    return null;
  }
}

export function clearAlbumCheckoutAuthIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ALBUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY);
    sessionStorage.removeItem(ALBUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * Guest clicked Sign in / Create account from album auth-gate.
 * Сохраняем намерение + ставим resume-флаг — после auth контроллер заберёт.
 */
export function beginAlbumCheckoutAuthIntent(
  context: AlbumCheckoutIntentContext
): AlbumCheckoutAuthIntent {
  const intent = saveAlbumCheckoutAuthIntent(context);
  markAlbumCheckoutResumeAfterAuth();
  return intent;
}

/**
 * Pending-key: одноразовый "следующий монтаж ServiceButtons для этого
 * album key — открой checkout-модал сам".
 *
 * Используется resume-контроллером после auth, читается на album page.
 * Хранится отдельно от intent, потому что intent уже потреблён к моменту
 * чтения, а pending-key должен пережить навигацию на returnTo.
 */
export function markPendingAlbumCheckoutForKey(albumKey: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = albumKey.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(ALBUM_CHECKOUT_PENDING_KEY_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

/**
 * Возвращает true и очищает флаг, если pending-key совпадает с переданным.
 * Идемпотентно — повторный вызов вернёт false.
 */
export function consumePendingAlbumCheckoutForKey(albumKey: string): boolean {
  if (typeof window === 'undefined') return false;
  const trimmed = albumKey.trim();
  if (!trimmed) return false;
  try {
    const stored = sessionStorage.getItem(ALBUM_CHECKOUT_PENDING_KEY_STORAGE_KEY);
    if (stored && stored === trimmed) {
      sessionStorage.removeItem(ALBUM_CHECKOUT_PENDING_KEY_STORAGE_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function clearPendingAlbumCheckoutForKey(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ALBUM_CHECKOUT_PENDING_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
