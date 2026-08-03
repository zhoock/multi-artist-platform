import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

export type HelpCategoryEmptyCopy = {
  title: string;
  description: string;
};

export function getHelpCategoryEmptyCopy(
  ui: IInterface | null | undefined,
  lang: SupportedLang
): HelpCategoryEmptyCopy {
  const help = ui?.help;
  const isRu = lang === 'ru';

  return {
    title: help?.categoryEmptyTitle ?? (isRu ? 'Статьи скоро появятся' : 'Articles coming soon'),
    description:
      help?.categoryEmptyDescription ??
      (isRu
        ? 'Мы готовим материалы для этой категории. Загляните позже.'
        : "We're preparing content for this category. Check back later."),
  };
}
