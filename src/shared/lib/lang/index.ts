/**
 * UI language storage + automatic browser detection.
 *
 * Поведение (как у современных платформ — Spotify, GitHub, YouTube):
 *  1. Если пользователь когда-то выбрал язык (header/settings) — используем
 *     сохранённое значение из localStorage['lang'].
 *  2. Иначе — определяем из `navigator.language`:
 *     `ru-*` / `ru_*` / `ru` → 'ru', всё остальное → 'en'.
 *  3. Fallback — 'en' (SSR, отсутствует navigator, и т.п.).
 *
 * НИКАКОГО onboarding-модала: язык выбирается прозрачно при первом визите
 * и больше не спрашивается. Ручной свитчер в Header/Settings
 * по-прежнему пишет в `localStorage['lang']` — это и есть "saved preference".
 *
 * Маппинг намеренно совпадает с серверным `normalizeEmailLocale`, чтобы UI
 * и email-локаль не расходились для одного и того же пользователя.
 */

const LANG_KEY = 'lang';

export type DetectedLang = 'en' | 'ru';

const hasStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isSupportedValue = (value: string | null | undefined): value is DetectedLang =>
  value === 'en' || value === 'ru';

/**
 * Detect UI language from the browser.
 * `ru`, `ru-RU`, `ru_KZ`, `RU-ru`, … → 'ru'; everything else → 'en'.
 */
export function detectBrowserLang(): DetectedLang {
  if (typeof navigator === 'undefined') return 'en';

  const candidates: string[] = [];
  if (typeof navigator.language === 'string') candidates.push(navigator.language);
  if (Array.isArray(navigator.languages)) {
    for (const value of navigator.languages) {
      if (typeof value === 'string') candidates.push(value);
    }
  }

  for (const raw of candidates) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (value === 'ru' || value.startsWith('ru-') || value.startsWith('ru_')) {
      return 'ru';
    }
    // Первый валидный non-ru hit — это явное предпочтение пользователя,
    // дальше по списку ru уже не должен «перебивать» английский.
    return 'en';
  }

  return 'en';
}

/**
 * Stored UI language preference, или browser-detected, или 'en'.
 * Возвращается всегда валидное `'en' | 'ru'`.
 */
export function getLang(): DetectedLang {
  if (!hasStorage()) {
    return detectBrowserLang();
  }

  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (isSupportedValue(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }

  return detectBrowserLang();
}

export function setLang(lang: string): void {
  if (!hasStorage()) {
    return;
  }

  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

/** @internal helper for tests/diagnostics */
export function __readStoredLangValueForTests(): string | null {
  if (!hasStorage()) return null;
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}
