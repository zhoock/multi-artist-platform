export const ARTICLE_EDITOR_TOAST_KEY = 'sc-article-editor-toast';

export const ARTICLE_EDITOR_TOAST_DURATION_MS = 4500;
export const ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS = 6500;

export type ArticleEditorToastPayload =
  | { kind: 'draft-saved' }
  | { kind: 'published'; articleHref: string }
  | { kind: 'error'; message: string };

export function queueArticleEditorToast(payload: ArticleEditorToastPayload): void {
  try {
    sessionStorage.setItem(ARTICLE_EDITOR_TOAST_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeArticleEditorToast(): ArticleEditorToastPayload | null {
  try {
    const raw = sessionStorage.getItem(ARTICLE_EDITOR_TOAST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ARTICLE_EDITOR_TOAST_KEY);
    return JSON.parse(raw) as ArticleEditorToastPayload;
  } catch {
    return null;
  }
}
