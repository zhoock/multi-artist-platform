import { toast } from './toastApi';
import {
  ARTICLE_EDITOR_TOAST_DURATION_MS,
  ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS,
} from './toastDurations';

export type ArticleEditorToastPayload =
  | { kind: 'draft-saved' }
  | { kind: 'published'; articleHref: string }
  | { kind: 'error'; message: string };

export function showArticleEditorToast(
  payload: ArticleEditorToastPayload,
  options: { lang: string; onOpenArticle: (href: string) => void }
): void {
  const en = options.lang !== 'ru';

  switch (payload.kind) {
    case 'draft-saved':
      toast.show({
        variant: 'success',
        title: en ? 'Draft saved' : 'Черновик сохранён',
        duration: ARTICLE_EDITOR_TOAST_DURATION_MS,
      });
      break;
    case 'published': {
      const toastId = toast.show({
        variant: 'success',
        title: en ? 'Article published' : 'Статья опубликована',
        duration: ARTICLE_EDITOR_TOAST_WITH_ACTION_DURATION_MS,
        action: {
          label: en ? 'Open article' : 'Открыть статью',
          onClick: () => {
            toast.dismiss(toastId);
            options.onOpenArticle(payload.articleHref);
          },
        },
      });
      break;
    }
    case 'error':
      toast.show({
        variant: 'error',
        title: payload.message,
        duration: ARTICLE_EDITOR_TOAST_DURATION_MS,
      });
      break;
    default:
      break;
  }
}
