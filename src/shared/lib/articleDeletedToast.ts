export const ARTICLE_DELETED_TOAST_KEY = 'sc-article-deleted-toast';

/** Длительность показа тоста в кабинете (мс); совпадает с UI-компонентом. */
export const ARTICLE_DELETED_TOAST_DURATION_MS = 4000;

export function queueArticleDeletedToast(message: string): void {
  try {
    sessionStorage.setItem(ARTICLE_DELETED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeArticleDeletedToast(): string | null {
  try {
    const message = sessionStorage.getItem(ARTICLE_DELETED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(ARTICLE_DELETED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
