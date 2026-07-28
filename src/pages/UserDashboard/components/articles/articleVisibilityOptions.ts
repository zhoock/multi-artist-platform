import type { IArticles, IInterface, DashboardTrackVisibilityLabels } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import { TRACK_VISIBILITY_OPTIONS, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { filterVisibilityOptionsByMonetization } from '@shared/lib/payment/artistMonetization';

type DashboardUi = NonNullable<IInterface['dashboard']>;
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  articleVisibility?: DashboardTrackVisibilityLabels;
};

export type ArticleVisibilityMenuOption = {
  value: TrackVisibility;
  label: string;
  description: string;
};

export type ArticleListDraftBadge = 'draft' | 'draft-changes' | null;

/** Статья ни разу не публиковалась. */
export function isArticleNeverPublished(article: Pick<IArticles, 'isDraft'>): boolean {
  return article.isDraft === true;
}

/** Статья хотя бы раз была опубликована. */
export function isArticlePublished(article: Pick<IArticles, 'isDraft'>): boolean {
  return article.isDraft === false;
}

/** @deprecated Use isArticleNeverPublished */
export function isArticleDraft(article: Pick<IArticles, 'isDraft'>): boolean {
  return isArticleNeverPublished(article);
}

export function hasArticleDraftChanges(
  article: Pick<IArticles, 'isDraft' | 'hasDraftChanges'>
): boolean {
  return article.isDraft === false && article.hasDraftChanges === true;
}

export function getArticleListDraftBadge(
  article: Pick<IArticles, 'isDraft' | 'hasDraftChanges'>
): ArticleListDraftBadge {
  if (isArticleNeverPublished(article)) {
    return 'draft';
  }
  if (hasArticleDraftChanges(article)) {
    return 'draft-changes';
  }
  return null;
}

export function buildArticleVisibilityMenuOptions(
  ui: IInterface | undefined,
  lang: SupportedLang,
  monetizationEnabled = true
): ArticleVisibilityMenuOption[] {
  const d = ui?.dashboard as DashboardUiWithTrackAccess | undefined;
  const t = d?.articleVisibility ?? d?.trackVisibility;
  const en = lang === 'en';
  const fallbacks = {
    public: {
      title: en ? 'Open to everyone' : 'Открыт для всех',
      description: en ? 'Article is available to all visitors' : 'Статья доступна всем посетителям',
    },
    subscribersOnly: {
      title: en ? 'Subscribers only' : 'Только для подписчиков',
      description: en
        ? 'Available to subscribers with active artist support'
        : 'Доступна подписчикам с активной поддержкой артиста',
    },
    hidden: {
      title: en ? 'Hidden' : 'Скрыт',
      description: en
        ? 'Not shown in the article list on the site'
        : 'Не отображается в списке статей на сайте',
    },
  } as const;

  const options = TRACK_VISIBILITY_OPTIONS.map((opt) => {
    const block =
      opt.value === 'public' ? t?.public : opt.value === 'hidden' ? t?.hidden : t?.subscribersOnly;
    const fb =
      opt.value === 'public'
        ? fallbacks.public
        : opt.value === 'hidden'
          ? fallbacks.hidden
          : fallbacks.subscribersOnly;
    return {
      value: opt.value,
      label: block?.title ?? fb.title,
      description: block?.description ?? fb.description,
    };
  });

  return filterVisibilityOptionsByMonetization(options, monetizationEnabled);
}

/** @deprecated Use `buildArticleVisibilityMenuOptions` */
export const buildVisibilityMenuOptions = buildArticleVisibilityMenuOptions;

export function getArticleVisibilityLabel(
  visibility: TrackVisibility,
  ui: IInterface | undefined,
  lang: SupportedLang
): string {
  return (
    buildArticleVisibilityMenuOptions(ui, lang).find((opt) => opt.value === visibility)?.label ?? ''
  );
}
