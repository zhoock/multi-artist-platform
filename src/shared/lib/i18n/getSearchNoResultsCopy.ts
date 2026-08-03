import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

export type SearchNoResultsCopy = {
  title: string;
  description: string;
};

export function getSearchNoResultsCopy(
  ui: IInterface | null | undefined,
  lang: SupportedLang
): SearchNoResultsCopy {
  const search = ui?.search;
  const isRu = lang === 'ru';

  return {
    title: search?.noResultsTitle ?? (isRu ? 'Ничего не найдено' : 'Nothing found'),
    description:
      search?.noResultsDescription ??
      (isRu ? 'Попробуйте изменить запрос' : 'Try changing your query'),
  };
}
