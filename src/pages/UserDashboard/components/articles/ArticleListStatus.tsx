import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

type ArticleListStatusProps = {
  isDraft: boolean;
  ui: IInterface | undefined;
  lang: SupportedLang;
};

export function ArticleListStatus({ isDraft, ui, lang }: ArticleListStatusProps) {
  if (!isDraft) {
    return null;
  }

  const label = ui?.dashboard?.albumStatusDraft ?? (lang === 'en' ? 'Draft' : 'Черновик');

  return (
    <span className="user-dashboard__album-status-badge user-dashboard__album-status-badge--neutral">
      <span className="user-dashboard__album-status-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
