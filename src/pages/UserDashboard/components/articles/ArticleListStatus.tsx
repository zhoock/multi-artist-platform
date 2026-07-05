import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import { StatusBadge } from '@shared/ui/statusBadge';

import type { ArticleListDraftBadge } from './articleVisibilityOptions';

type ArticleListStatusProps = {
  draftBadge: ArticleListDraftBadge;
  ui: IInterface | undefined;
  lang: SupportedLang;
};

export function ArticleListStatus({ draftBadge, ui, lang }: ArticleListStatusProps) {
  if (!draftBadge) {
    return null;
  }

  const en = lang === 'en';
  const label =
    draftBadge === 'draft-changes'
      ? (ui?.dashboard?.articleStatusDraftChanges ?? (en ? 'Draft changes' : 'Черновые правки'))
      : (ui?.dashboard?.albumStatusDraft ?? (en ? 'Draft' : 'Черновик'));

  return <StatusBadge variant="draft">{label}</StatusBadge>;
}
